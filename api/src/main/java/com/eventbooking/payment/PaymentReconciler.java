package com.eventbooking.payment;

import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.payment.bakong.BakongCheckResult;
import com.eventbooking.payment.bakong.BakongClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Asks Bakong about open QRs and hands the answers to {@link PaymentService}.
 *
 * <p>Deliberately <b>not</b> transactional, and deliberately a separate class
 * from the service rather than a couple of methods on it. Both facts come from
 * the same constraint: the provider call is a network round trip and must not
 * happen inside a transaction that holds row locks. A locked booking whose
 * transaction is waiting on a socket blocks every other write to that booking -
 * including the sweeper - for as long as the socket takes.
 *
 * <p>So each attempt is settled in three steps: read what is needed (short
 * transaction), call the provider (no transaction), apply the answer (short
 * transaction). Spring's proxying would quietly skip the annotations if these
 * lived on one bean and called each other, which is the second reason for the
 * split.
 */
@Component
public class PaymentReconciler {

    private static final Logger log = LoggerFactory.getLogger(PaymentReconciler.class);

    private final PaymentService paymentService;
    private final BakongClient bakongClient;
    private final PaymentProperties properties;

    public PaymentReconciler(PaymentService paymentService,
                             BakongClient bakongClient,
                             PaymentProperties properties) {
        this.paymentService = paymentService;
        this.bakongClient = bakongClient;
        this.properties = properties;
    }

    /**
     * One pass over the open attempts, oldest check first.
     *
     * @return how many were checked - not how many settled
     */
    public int sweep() {
        List<Long> openIds = paymentService.findOpenAttemptIds(properties.poll().batchSize());
        if (openIds.isEmpty()) {
            return 0;
        }

        int checked = 0;
        for (Long paymentId : openIds) {
            // One failure must not abandon the rest of the batch: the attempts
            // behind this one belong to customers watching a spinner.
            try {
                if (reconcileNow(paymentId)) {
                    checked++;
                }
            } catch (RuntimeException e) {
                log.error("Reconciling payment {} failed; continuing with the batch", paymentId, e);
            }
        }

        log.debug("Payment sweep checked {} of {} open attempt(s)", checked, openIds.size());
        return checked;
    }

    /**
     * Checks one attempt now, on behalf of a client that is watching it.
     *
     * <p>Rate-limited per attempt: a pay screen left open in twenty tabs must
     * not become twenty times the load on Bakong, which meters by token. Inside
     * the window the caller gets what the database already knows, which is
     * exactly what the background sweep is keeping fresh anyway.
     */
    public PaymentResponse refresh(Long paymentId, Long actorUserId) {
        PaymentResponse current = paymentService.getForUser(paymentId, actorUserId);

        if (!current.open() || !isDueForCheck(current.lastPolledAt())) {
            return current;
        }

        reconcileNow(paymentId);
        return paymentService.getForUser(paymentId, actorUserId);
    }

    /**
     * Checks one attempt with no rate limit in the way.
     *
     * <p>The sweep and the simulation hooks call this; {@link #refresh} adds the
     * per-attempt floor on top, because that one is reachable from a browser.
     *
     * @return false if the attempt closed between being listed and being read
     */
    public boolean reconcileNow(Long paymentId) {
        var target = paymentService.loadPollTarget(paymentId).orElse(null);
        if (target == null) {
            return false;
        }

        // The network call, outside any transaction. Never throws: an
        // unreachable provider comes back as UNAVAILABLE, which the service
        // treats as "still unknown" rather than "unpaid".
        BakongCheckResult result = bakongClient.checkByMd5(target.providerRef());
        paymentService.applyProviderResult(paymentId, result);
        return true;
    }

    private boolean isDueForCheck(Instant lastPolledAt) {
        if (lastPolledAt == null) {
            return true;
        }
        Duration floor = properties.poll().minRefreshInterval();
        return lastPolledAt.plus(floor).isBefore(Instant.now());
    }
}
