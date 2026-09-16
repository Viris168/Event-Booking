package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.dto.admin.AdminPaymentResponse;
import com.eventbooking.dto.admin.EventPaymentHealthResponse;
import com.eventbooking.dto.admin.PaymentReconcileResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.Event;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.service.payment.PaymentReconciler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The admin payments screen, served from payment_transaction.
 *
 * <p>Not the {@code payments} table, which holds ABA PayWay's own request and
 * response payload and exists for that integration's benefit.
 * {@code payment_transaction} is this system's record of an attempt to collect
 * a booking's money, whichever provider it went through, and is the only one of
 * the two that can answer "what is outstanding".
 */
@Service
public class AdminPaymentService {

    /**
     * How long an attempt may stay open before it is worth a human looking at.
     *
     * <p>One hour, carried over from the prototype. It is long enough that a
     * customer who wandered off mid-KHQR is not flagged, and short enough that
     * a provider callback that never arrived shows up the same morning.
     */
    public static final Duration STUCK_AFTER = Duration.ofHours(1);

    private final PaymentTransactionRepository paymentRepository;
    private final PaymentReconciler reconciler;

    public AdminPaymentService(PaymentTransactionRepository paymentRepository,
                               PaymentReconciler reconciler) {
        this.paymentRepository = paymentRepository;
        this.reconciler = reconciler;
    }

    /**
     * Put one attempt to its provider now, and hand back what it says.
     *
     * <p>This is what the stuck flag was always for. The screen could show that
     * an attempt had been open for hours with no webhook and offer nothing to
     * do about it, while {@link PaymentReconciler#reconcileNow} - which settles
     * exactly this case, for both providers - was reachable only from the
     * dev-profile simulation controller. So in production the one remedy for a
     * missing callback was a database edit.
     *
     * <p>Deliberately NOT transactional, and it must not become so: the call it
     * delegates to makes a network round trip, and the reconciler's own comment
     * explains at length why that may not happen inside a transaction holding
     * row locks. The read afterwards is its own short one.
     *
     * <p>The rate floor is the reconciler's, not re-implemented here. An admin
     * pressing the button twice is exactly the case it exists for, and a
     * second opinion about how often Bakong may be asked is how two answers
     * start disagreeing.
     */
    public PaymentReconcileResponse reconcile(Long paymentId) {
        boolean checked = reconciler.reconcileNow(paymentId);
        return new PaymentReconcileResponse(checked, findOne(paymentId));
    }

    /**
     * One attempt, mapped like a row of the table.
     *
     * <p>No {@code @Transactional}: it is called from {@link #reconcile} on the
     * same bean, so Spring's proxy would not apply one anyway - and the point
     * of the query it uses is that it needs no open session afterwards, because
     * the booking and event come back already attached.
     */
    private AdminPaymentResponse findOne(Long paymentId) {
        Instant cutoff = Instant.now().minus(STUCK_AFTER);
        PaymentTransaction p = paymentRepository.findForAdminById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("No payment attempt " + paymentId));
        return toResponse(p, isStuck(p, cutoff));
    }

    /**
     * Payment attempts, newest first.
     *
     * @param provider  exact provider, or null for all.
     * @param status    exact status, or null for all.
     * @param eventId   attempts against one event only, or null for all.
     * @param stuckOnly keep only open attempts older than {@link #STUCK_AFTER}.
     */
    @Transactional(readOnly = true)
    public List<AdminPaymentResponse> list(PaymentProvider provider, PaymentStatus status,
                                           Long eventId, boolean stuckOnly) {
        Instant cutoff = Instant.now().minus(STUCK_AFTER);

        return paymentRepository.findForAdmin(provider, status, eventId).stream()
                .map(p -> toResponse(p, isStuck(p, cutoff)))
                .filter(r -> !stuckOnly || r.stuck())
                .toList();
    }

    /**
     * Attempts, settlements and failures per event - worst first.
     *
     * <p>Sorted here rather than in the browser because the order is the
     * feature: the panel exists to say which event is failing to collect, and
     * the answer is the top row. Ties break on the larger event, so a 50% rate
     * over forty attempts outranks the same rate over two.
     *
     * <p>Events with nothing in flight and nothing failed still come back. The
     * caller decides how much of the tail to show; deciding that here would
     * mean a threshold buried in a service that the screen cannot explain.
     */
    @Transactional(readOnly = true)
    public List<EventPaymentHealthResponse> healthByEvent() {
        // eventId -> [settled, failed, open, settledUsdCents]
        Map<Long, long[]> counts = new HashMap<>();
        Map<Long, String[]> titles = new HashMap<>();

        for (Object[] row : paymentRepository.countByEventAndStatus()) {
            Long eventId = (Long) row[0];
            PaymentStatus status = (PaymentStatus) row[3];
            long count = ((Number) row[4]).longValue();
            long usdCents = ((Number) row[5]).longValue();

            titles.computeIfAbsent(eventId, k -> new String[] { (String) row[1], (String) row[2] });
            long[] c = counts.computeIfAbsent(eventId, k -> new long[4]);
            if (status == PaymentStatus.SUCCESS) {
                c[0] += count;
                // Only the settled group's money is carried. Summing the failed
                // and expired ones too would produce a total nobody was ever
                // paid, sitting in a column headed with a currency.
                c[3] += usdCents;
            } else if (status.isOpen()) {
                c[2] += count;
            } else {
                c[1] += count;
            }
        }

        List<EventPaymentHealthResponse> out = new ArrayList<>(counts.size());
        counts.forEach((eventId, c) -> out.add(new EventPaymentHealthResponse(
                eventId, titles.get(eventId)[0], titles.get(eventId)[1],
                c[0] + c[1] + c[2], c[0], c[1], c[2], c[3])));

        out.sort(Comparator
                .comparingDouble(EventPaymentHealthResponse::failureRate).reversed()
                .thenComparing(Comparator.comparingLong(EventPaymentHealthResponse::attempts).reversed()));
        return out;
    }

    /**
     * Open, and opened before the cutoff.
     *
     * <p>{@code isOpen()} rather than a literal status list: PaymentStatus
     * already owns which of its values are still settleable, and restating that
     * here is how the two drift apart the first time a status is added.
     */
    private static boolean isStuck(PaymentTransaction p, Instant cutoff) {
        return p.getStatus().isOpen()
                && p.getCreatedAt() != null
                && !p.getCreatedAt().isAfter(cutoff);
    }

    private static AdminPaymentResponse toResponse(PaymentTransaction p, boolean stuck) {
        Booking b = p.getBooking();
        Event e = b == null ? null : b.getEvent();
        return new AdminPaymentResponse(
                p.getId(),
                p.getProvider(),
                p.getStatus(),
                p.getCurrencyCharged(),
                p.getAmountUsdCents(),
                p.getAmountKhr(),
                p.getProviderRef(),
                p.getCreatedAt(),
                p.getExpiresAt(),
                p.getResolvedAt(),
                stuck,
                b == null ? null : b.getId(),
                b == null ? null : b.getBookingRef(),
                b == null ? null : b.getState(),
                b == null ? null : b.getBuyerName(),
                e == null ? null : e.getId(),
                e == null ? null : e.getTitleEn(),
                e == null ? null : e.getTitleKm());
    }
}
