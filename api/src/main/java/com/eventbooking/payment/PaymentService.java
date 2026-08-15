package com.eventbooking.payment;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.booking.BookingProperties;
import com.eventbooking.booking.BookingStateMachine;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.payment.bakong.BakongCheckResult;
import com.eventbooking.payment.bakong.KhqrGenerator;
import com.eventbooking.payment.error.BookingNotPayableException;
import com.eventbooking.payment.error.PaymentAlreadySettledException;
import com.eventbooking.payment.error.PaymentNotFoundException;
import com.eventbooking.payment.error.UnsupportedPaymentProviderException;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.ticket.TicketService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Payment attempts and what they do to a booking (issue #31).
 *
 * <p>Bakong's open API has no webhook for the accounts this platform uses, so
 * settlement is <em>discovered</em>, not delivered: {@code PaymentReconciler}
 * asks the provider about every open QR and hands the answer back here. That
 * inverts the usual worry. A webhook integration guards against a callback
 * arriving twice; a polling one is <em>built</em> on asking the same question
 * over and over, so "already applied" is the normal case rather than the edge
 * one, and every write below has to survive being attempted repeatedly.
 *
 * <p>Four layers keep a repeated answer from confirming a booking twice:
 *
 * <ol>
 *   <li>{@link #applyProviderResult} re-reads the attempt under a row lock and
 *       returns immediately unless it is still open. Two concurrent polls
 *       serialise on that lock and the second one finds a settled row.</li>
 *   <li>{@code BookingService.transition} and the state machine treat a
 *       repeat of the state a booking is already in as a no-op, so no second
 *       history row is written even if this class asks twice.</li>
 *   <li>{@code uq_payment_txn_one_success_per_booking} refuses a second
 *       SUCCESS row in the database, whatever the application believes.</li>
 *   <li>{@code uq_payment_txn_provider_ref} refuses two rows for one QR.</li>
 * </ol>
 *
 * <p><b>Lock order is booking, then payment</b> - in every method here, and it
 * has to stay that way. {@link #startPayment} naturally takes the booking
 * first and then writes payment rows; if the reconciler locked the payment
 * first and then reached for the booking, a customer pressing "pay" while the
 * poller settles their previous attempt would deadlock the two transactions.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    /** Booking states that can still take money. */
    private static final Set<BookingStatus> PAYABLE = EnumSet.of(
            BookingStatus.PENDING_PAYMENT,
            BookingStatus.AWAITING_CONFIRMATION,
            BookingStatus.PAYMENT_FAILED);

    /**
     * A QR with less life than this is not worth issuing - the customer cannot
     * realistically open a banking app and scan it, and it would only produce
     * an attempt that expires before anyone touches it.
     */
    private static final Duration MIN_QR_LIFE = Duration.ofSeconds(30);

    private final PaymentTransactionRepository paymentRepository;
    private final BookingRepository bookingRepository;
    private final BookingStateMachine stateMachine;
    private final KhqrGenerator khqrGenerator;
    private final PaymentMapper mapper;
    private final TicketService ticketService;
    private final PaymentProperties paymentProperties;
    private final BookingProperties bookingProperties;

    public PaymentService(PaymentTransactionRepository paymentRepository,
                          BookingRepository bookingRepository,
                          BookingStateMachine stateMachine,
                          KhqrGenerator khqrGenerator,
                          PaymentMapper mapper,
                          TicketService ticketService,
                          PaymentProperties paymentProperties,
                          BookingProperties bookingProperties) {
        this.paymentRepository = paymentRepository;
        this.bookingRepository = bookingRepository;
        this.stateMachine = stateMachine;
        this.khqrGenerator = khqrGenerator;
        this.mapper = mapper;
        this.ticketService = ticketService;
        this.paymentProperties = paymentProperties;
        this.bookingProperties = bookingProperties;
    }

    // ------------------------------------------------------------------
    // Opening an attempt
    // ------------------------------------------------------------------

    /**
     * Issues a KHQR for a booking, or hands back the one already outstanding.
     *
     * <p>Idempotent by design, in the same spirit as checkout: a customer who
     * refreshes the pay screen, or double-taps "pay", must see the <em>same</em>
     * QR rather than a second one. Two open QRs for one booking would both be
     * payable, and the second payment would have nowhere to go -
     * {@code uq_payment_txn_one_success_per_booking} would refuse it and the
     * money would need a manual refund.
     *
     * <p>The booking row lock taken on the first line is what makes that check
     * hold under a genuine double-submit: without it, two requests could each
     * find no open attempt and each mint a QR.
     *
     * @param actorUserId the authenticated caller; someone else's booking is
     *                    reported as not found, never as forbidden
     */
    @Transactional
    public PaymentResponse startPayment(Long bookingId, PaymentProvider provider, Long actorUserId) {
        if (provider != PaymentProvider.BAKONG_KHQR) {
            throw new UnsupportedPaymentProviderException(provider);
        }

        Booking booking = lockOwnedBooking(bookingId, actorUserId);
        Instant now = Instant.now();

        if (booking.getState() == BookingStatus.CONFIRMED
                || paymentRepository.existsByBookingIdAndStatus(bookingId, PaymentStatus.SUCCESS)) {
            throw new PaymentAlreadySettledException("Booking " + bookingId + " has already been paid.");
        }
        if (!PAYABLE.contains(booking.getState())) {
            throw new BookingNotPayableException(bookingId, booking.getState());
        }

        Optional<PaymentTransaction> outstanding = paymentRepository
                .findFirstByBookingIdAndStatusInOrderByCreatedAtDesc(bookingId, PaymentStatus.openStates());

        if (outstanding.isPresent()) {
            PaymentTransaction open = outstanding.get();
            if (open.getProvider() == provider && !open.hasExpired(now)) {
                log.debug("Booking {} already has open attempt {}; returning the same QR", bookingId, open.getId());
                return mapper.toResponse(open);
            }
            // Either its clock ran out or the customer switched provider. Close
            // it before opening the next, so "at most one open attempt per
            // booking" stays true and the reconciler never has two to chase.
            closeOutstanding(open, now, open.hasExpired(now)
                    ? PaymentStatus.EXPIRED
                    : PaymentStatus.CANCELLED);
        }

        PaymentTransaction attempt = openKhqrAttempt(booking, now);
        advanceToAwaitingConfirmation(booking, attempt, actorUserId);

        log.info("Opened {} attempt {} for booking {} ({}): {} {}",
                provider, attempt.getId(), bookingId, booking.getBookingRef(),
                attempt.getCurrencyCharged(), chargedAmount(attempt));

        return mapper.toResponse(attempt);
    }

    private PaymentTransaction openKhqrAttempt(Booking booking, Instant now) {
        PaymentProperties.Bakong config = paymentProperties.bakong();
        PaymentCurrency currency = config.currency();

        Instant expiresAt = qrExpiry(booking, now);
        long minorUnits = currency == PaymentCurrency.KHR
                ? booking.getTotalKhr()
                : booking.getTotalUsdCents();

        KhqrGenerator.Khqr qr = khqrGenerator.generate(
                booking.getBookingRef(), currency, minorUnits, now, expiresAt);

        // Readable and deterministic under the booking lock: attempt 1, 2, 3...
        // for this reference. The UNIQUE constraint on it is the backstop if a
        // request somehow gets past that lock.
        long attemptNo = paymentRepository.countByBookingId(booking.getId()) + 1;
        String idempotencyKey = "KHQR-" + booking.getBookingRef() + "-" + attemptNo;

        return paymentRepository.save(PaymentTransaction.builder()
                .booking(booking)
                .provider(PaymentProvider.BAKONG_KHQR)
                .providerRef(qr.md5())
                .idempotencyKey(idempotencyKey)
                .currencyCharged(currency)
                .amountUsdCents(booking.getTotalUsdCents())
                .amountKhr(booking.getTotalKhr())
                .status(PaymentStatus.CREATED)
                .expiresAt(expiresAt)
                .createdAt(now)
                .qrPayload(qr.payload())
                .pollAttempts(0)
                .build());
    }

    /**
     * A QR lives for its configured TTL, but never past the booking's own
     * payment window: once that lapses the seats go back on sale, and a QR
     * outliving them is an invitation to pay for something already resold.
     */
    private Instant qrExpiry(Booking booking, Instant now) {
        Instant bookingDeadline = booking.getCreatedAt()
                .plus(Duration.ofMinutes(bookingProperties.paymentWindowMinutes()));
        Instant ttlExpiry = now.plus(paymentProperties.bakong().qrTtl());
        Instant expiresAt = ttlExpiry.isBefore(bookingDeadline) ? ttlExpiry : bookingDeadline;

        if (expiresAt.isBefore(now.plus(MIN_QR_LIFE))) {
            // The booking is out of time; the sweeper is about to expire it and
            // hand the inventory back. Issuing a QR here would take money for
            // seats that are on their way to somebody else.
            throw new BookingNotPayableException(booking.getId(), booking.getState());
        }
        return expiresAt;
    }

    /**
     * Moves the booking to AWAITING_CONFIRMATION - "an attempt is in flight".
     * A retry after a failure has to pass back through PENDING_PAYMENT because
     * that is the only edge out of PAYMENT_FAILED; both hops are recorded, so
     * the history reads as what actually happened.
     */
    private void advanceToAwaitingConfirmation(Booking booking, PaymentTransaction attempt, Long actorUserId) {
        String note = attempt.getProvider() + " " + attempt.getIdempotencyKey();

        if (booking.getState() == BookingStatus.PAYMENT_FAILED) {
            stateMachine.transition(booking, BookingStatus.PENDING_PAYMENT, actorUserId, "Retrying payment");
        }
        if (booking.getState() == BookingStatus.PENDING_PAYMENT) {
            stateMachine.transition(booking, BookingStatus.AWAITING_CONFIRMATION, actorUserId, note);
        }
        // Already AWAITING_CONFIRMATION when a previous attempt expired and this
        // one replaces it - nothing to record, the booking has not moved.
    }

    private void closeOutstanding(PaymentTransaction attempt, Instant now, PaymentStatus terminal) {
        attempt.setStatus(terminal);
        attempt.setResolvedAt(now);
        attempt.setNote(terminal == PaymentStatus.EXPIRED
                ? "QR expired before payment"
                : "Superseded by a newer attempt");
        log.info("Attempt {} on booking {} closed as {}",
                attempt.getId(), attempt.getBooking().getId(), terminal);
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    /**
     * Mapping happens inside the transaction on purpose: open-in-view is off,
     * so the booking association the response reports cannot be walked once
     * this returns.
     */
    @Transactional(readOnly = true)
    public PaymentResponse getForUser(Long paymentId, Long actorUserId) {
        return mapper.toResponse(loadOwned(paymentId, actorUserId));
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> listForBooking(Long bookingId, Long actorUserId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException("Booking " + bookingId + " does not exist."));
        requireOwner(booking, actorUserId);

        return paymentRepository.findByBookingIdOrderByCreatedAtDesc(bookingId).stream()
                .map(mapper::toResponse)
                .toList();
    }

    /** The reconciler's work queue - see {@code PaymentTransactionRepository.findOpenIds}. */
    @Transactional(readOnly = true)
    public List<Long> findOpenAttemptIds(int limit) {
        return paymentRepository.findOpenIds(PaymentStatus.openStates(), PageRequest.of(0, limit));
    }

    /**
     * What the reconciler needs to ask the provider a question, without holding
     * a transaction open across an HTTP call.
     */
    @Transactional(readOnly = true)
    public Optional<PollTarget> loadPollTarget(Long paymentId) {
        return paymentRepository.findById(paymentId)
                .filter(PaymentTransaction::isOpen)
                .map(p -> new PollTarget(p.getId(), p.getProvider(), p.getProviderRef()));
    }

    // ------------------------------------------------------------------
    // Applying what the provider said
    // ------------------------------------------------------------------

    /**
     * Settles, expires, or simply notes an attempt, according to the provider's
     * answer. Safe to call with the same answer any number of times.
     *
     * <p>Called by the reconciler after the HTTP call has already returned, so
     * the locks below are held for a database round trip rather than for a
     * network one.
     */
    @Transactional
    public void applyProviderResult(Long paymentId, BakongCheckResult result) {
        // Booking first, then payment - the lock order the whole class keeps.
        // The booking id is fetched as a scalar so no PaymentTransaction is
        // loaded into this persistence context before it is locked, which would
        // otherwise hand the lock query a stale cached entity.
        Long bookingId = paymentRepository.findBookingIdOf(paymentId).orElse(null);
        if (bookingId == null) {
            log.warn("Payment {} vanished before its result could be applied", paymentId);
            return;
        }

        Booking booking = bookingRepository.findByIdForUpdate(bookingId).orElseThrow(
                () -> new BookingNotFoundException("Booking " + bookingId + " does not exist."));
        PaymentTransaction attempt = paymentRepository.findByIdForUpdate(paymentId)
                .orElseThrow(() -> new PaymentNotFoundException(paymentId));

        Instant now = Instant.now();

        if (!attempt.isOpen()) {
            // Settled while this poll was in flight. The ordinary outcome of two
            // pollers, or of a browser refresh racing the sweep - and the reason
            // polling cannot double-confirm.
            if (result.outcome() == BakongCheckResult.Outcome.PAID
                    && attempt.getStatus() != PaymentStatus.SUCCESS) {
                // Rarer and worth shouting about: money landed on an attempt this
                // side had already given up on. Not recorded as SUCCESS - the
                // booking may have been paid by a later attempt, and two SUCCESS
                // rows are exactly what the schema forbids. An operator refunds it.
                attempt.setNote("Paid after this attempt closed as " + attempt.getStatus()
                        + " (provider hash " + result.transactionHash() + ") - needs manual reconciliation");
                log.error("Late payment on closed attempt {} for booking {}: provider hash {}",
                        paymentId, bookingId, result.transactionHash());
            }
            return;
        }

        attempt.markPolled(now);

        switch (result.outcome()) {
            case PAID -> settle(booking, attempt, result, now);
            case NOT_FOUND -> {
                if (attempt.hasExpired(now)) {
                    expire(booking, attempt, now);
                } else if (attempt.getStatus() == PaymentStatus.CREATED) {
                    // We have now had a real conversation with the provider about
                    // this QR; it just has not been paid. That is what PENDING
                    // means here, and it tells an operator the poller is alive.
                    attempt.setStatus(PaymentStatus.PENDING);
                }
            }
            case UNAVAILABLE -> {
                // Never read as "unpaid": a provider outage must not fail a
                // booking. The attempt still expires on its own clock, because a
                // QR nobody can verify is no better than one nobody scanned.
                if (attempt.hasExpired(now)) {
                    expire(booking, attempt, now);
                } else {
                    attempt.setNote("Provider unreachable: " + result.message());
                }
            }
        }
    }

    private void settle(Booking booking, PaymentTransaction attempt, BakongCheckResult result, Instant now) {
        attempt.setStatus(PaymentStatus.SUCCESS);
        attempt.setResolvedAt(now);
        attempt.setProviderTxnHash(result.transactionHash());
        attempt.setNote(null);

        log.info("Payment {} for booking {} settled: {} {} (provider hash {})",
                attempt.getId(), booking.getId(), attempt.getCurrencyCharged(),
                chargedAmount(attempt), result.transactionHash());

        confirm(booking, attempt);

        // Tickets are issued here rather than on a listener, and in this same
        // transaction, because a customer whose payment succeeded but whose
        // tickets quietly failed has no way of finding out until the gate turns
        // them away. Either both land or neither does - and if neither, the
        // attempt stays open and the next poll settles it again. Issuance is
        // idempotent, so that retry cannot double-issue.
        if (booking.getState() == BookingStatus.CONFIRMED) {
            ticketService.issueForBooking(booking);
        }
    }

    /**
     * Walks the booking to CONFIRMED along legal edges only.
     *
     * <p>Normally one hop: {@link #startPayment} left it in
     * AWAITING_CONFIRMATION. The other cases are defensive - a booking that was
     * put back by hand, or an attempt confirmed before the state write landed.
     */
    private void confirm(Booking booking, PaymentTransaction attempt) {
        String note = attempt.getProvider() + " " + attempt.getProviderTxnHash();

        if (booking.getState() == BookingStatus.CONFIRMED) {
            return; // Someone already got here. Nothing to write, nothing to audit.
        }
        if (stateMachine.isTerminal(booking.getState())
                || booking.getState() == BookingStatus.REFUND_REQUESTED
                || booking.getState() == BookingStatus.REFUNDED) {
            // The booking died - expired, cancelled, refunded - and the money
            // turned up anyway. Confirming would re-sell inventory that has
            // already gone back to the pool, so the payment stands as a SUCCESS
            // row flagged for a human, and the booking is left alone.
            attempt.setNote("Paid after the booking reached " + booking.getState()
                    + " - needs manual refund");
            log.error("Booking {} was {} when payment {} settled; refund required",
                    booking.getId(), booking.getState(), attempt.getId());
            return;
        }

        if (booking.getState() == BookingStatus.PAYMENT_FAILED) {
            stateMachine.transition(booking, BookingStatus.PENDING_PAYMENT, null, "Late settlement");
        }
        if (booking.getState() == BookingStatus.PENDING_PAYMENT) {
            stateMachine.transition(booking, BookingStatus.AWAITING_CONFIRMATION, null, note);
        }
        stateMachine.transition(booking, BookingStatus.CONFIRMED, null, note);
    }

    /**
     * The timeout path. The attempt dies; the booking drops back to
     * PAYMENT_FAILED, which is <em>not</em> terminal, so the customer keeps
     * their seats and can start a fresh QR. Handing the inventory back is the
     * booking payment window's job, one level up -
     * {@code BookingService.expireStaleBookings}.
     */
    private void expire(Booking booking, PaymentTransaction attempt, Instant now) {
        attempt.setStatus(PaymentStatus.EXPIRED);
        attempt.setResolvedAt(now);
        attempt.setNote("QR expired before payment");

        if (booking.getState() == BookingStatus.AWAITING_CONFIRMATION) {
            stateMachine.transition(booking, BookingStatus.PAYMENT_FAILED, null,
                    "KHQR expired before payment");
        }

        log.info("Attempt {} on booking {} expired after {} poll(s)",
                attempt.getId(), booking.getId(), attempt.getPollAttempts());
    }

    /**
     * Pulls an attempt's clock forward so it expires immediately.
     *
     * <p>A test hook, exposed only by the simulation controller and only in MOCK
     * mode. The production timeout is the reconciler noticing {@code expires_at}
     * has passed - and this runs that same {@link #expire} path rather than a
     * parallel one, so what a tester sees is what a real timeout does.
     */
    @Transactional
    public PaymentResponse expireAttemptNow(Long paymentId, Long actorUserId) {
        Long bookingId = paymentRepository.findBookingIdOf(paymentId)
                .orElseThrow(() -> new PaymentNotFoundException(paymentId));

        Booking booking = lockOwnedBooking(bookingId, actorUserId);
        PaymentTransaction attempt = paymentRepository.findByIdForUpdate(paymentId)
                .orElseThrow(() -> new PaymentNotFoundException(paymentId));

        if (attempt.isOpen()) {
            Instant now = Instant.now();
            attempt.setExpiresAt(now);
            expire(booking, attempt, now);
        }
        return mapper.toResponse(attempt);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private Booking lockOwnedBooking(Long bookingId, Long actorUserId) {
        Booking booking = bookingRepository.findByIdForUpdate(bookingId)
                .orElseThrow(() -> new BookingNotFoundException("Booking " + bookingId + " does not exist."));
        requireOwner(booking, actorUserId);
        return booking;
    }

    private PaymentTransaction loadOwned(Long paymentId, Long actorUserId) {
        PaymentTransaction attempt = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new PaymentNotFoundException(paymentId));
        if (!attempt.getBooking().getUserId().equals(actorUserId)) {
            throw new PaymentNotFoundException(paymentId);
        }
        return attempt;
    }

    private void requireOwner(Booking booking, Long actorUserId) {
        if (!booking.getUserId().equals(actorUserId)) {
            throw new BookingNotFoundException("Booking " + booking.getId() + " does not exist.");
        }
    }

    private long chargedAmount(PaymentTransaction attempt) {
        return attempt.getCurrencyCharged() == PaymentCurrency.KHR
                ? attempt.getAmountKhr()
                : attempt.getAmountUsdCents();
    }

    /** Just enough of an attempt to ask the provider about it. */
    public record PollTarget(Long paymentId, PaymentProvider provider, String providerRef) {
    }
}
