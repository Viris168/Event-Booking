package com.eventbooking.booking;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.booking.error.IllegalBookingTransitionException;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingStatusHistory;
import com.eventbooking.repository.BookingStatusHistoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static com.eventbooking.Enumeration.BookingStatus.AWAITING_CONFIRMATION;
import static com.eventbooking.Enumeration.BookingStatus.CANCELLED;
import static com.eventbooking.Enumeration.BookingStatus.CONFIRMED;
import static com.eventbooking.Enumeration.BookingStatus.EXPIRED;
import static com.eventbooking.Enumeration.BookingStatus.PAYMENT_FAILED;
import static com.eventbooking.Enumeration.BookingStatus.PENDING_PAYMENT;
import static com.eventbooking.Enumeration.BookingStatus.REFUNDED;
import static com.eventbooking.Enumeration.BookingStatus.REFUND_REQUESTED;

/**
 * The single gate for every booking.state write.
 *
 * Two jobs, and they are deliberately fused: refuse illegal edges, and append
 * a booking_status_history row for every legal one. Fusing them is the point -
 * if callers could set state directly they would eventually forget the audit
 * row, and a booking's history would silently develop holes.
 *
 * <pre>
 *                    +--------------------+
 *                    |  PENDING_PAYMENT   |<---------+
 *                    +--------------------+          |
 *                       |      |      |              | retry
 *          pay initiated|      |      |              |
 *                       v      |      |     +----------------+
 *            +----------------+|      |     | PAYMENT_FAILED |
 *            | AWAITING_CONF. ||      |     +----------------+
 *            +----------------+|      |         ^        |
 *              |    |    |     |      |         |        |
 *      success |    |    +-----|------|---------+        |
 *              v    |          |      |                  |
 *        +-----------+         |      |                  |
 *        | CONFIRMED |         |      +---> CANCELLED <--+
 *        +-----------+         +------------> EXPIRED <--+
 *          |      ^
 *          v      |  rejected
 *  +------------------+
 *  | REFUND_REQUESTED |----> REFUNDED
 *  +------------------+
 * </pre>
 *
 * Note there is no HELD state here despite the issue title: HELD lives on
 * hold.status, and a booking only exists once a hold has been converted. See
 * the note on {@link BookingStatus}.
 */
@Component
public class BookingStateMachine {

    private static final Logger log = LoggerFactory.getLogger(BookingStateMachine.class);

    /**
     * States from which nothing further is possible. Reaching one is what
     * releases inventory back to the pool (BookingService handles that side).
     */
    private static final Set<BookingStatus> TERMINAL = Collections.unmodifiableSet(
            EnumSet.of(REFUNDED, EXPIRED, CANCELLED));

    private static final Map<BookingStatus, Set<BookingStatus>> LEGAL_TRANSITIONS;

    static {
        Map<BookingStatus, Set<BookingStatus>> t = new EnumMap<>(BookingStatus.class);

        // Freshly converted from a hold, nothing charged yet. The customer can
        // start a payment, walk away, or let the payment window lapse.
        t.put(PENDING_PAYMENT, EnumSet.of(AWAITING_CONFIRMATION, PAYMENT_FAILED, EXPIRED, CANCELLED));

        // A payment attempt is in flight with Bakong/PayWay. We are waiting on
        // a webhook, which may confirm it, fail it, or never arrive at all -
        // hence EXPIRED is reachable from here too, driven by the reconciler.
        t.put(AWAITING_CONFIRMATION, EnumSet.of(CONFIRMED, PAYMENT_FAILED, EXPIRED, CANCELLED));

        // Not terminal on purpose: the schema explicitly allows several
        // payment_transaction attempts per booking (retry after a bad PIN,
        // switching KHQR -> PayWay), so a failure returns the customer to
        // PENDING_PAYMENT to try again while the hold-derived inventory is
        // still theirs.
        t.put(PAYMENT_FAILED, EnumSet.of(PENDING_PAYMENT, EXPIRED, CANCELLED));

        // Paid. The only way out is the refund path - never straight to
        // CANCELLED, because money has changed hands and uq_payment_txn_one_
        // success_per_booking means it cannot simply be un-charged.
        t.put(CONFIRMED, EnumSet.of(REFUND_REQUESTED));

        // An organizer or admin either grants the refund or turns it down, in
        // which case the booking is still a valid, paid, scannable ticket.
        t.put(REFUND_REQUESTED, EnumSet.of(REFUNDED, CONFIRMED));

        t.put(REFUNDED, EnumSet.noneOf(BookingStatus.class));
        t.put(EXPIRED, EnumSet.noneOf(BookingStatus.class));
        t.put(CANCELLED, EnumSet.noneOf(BookingStatus.class));

        t.replaceAll((k, v) -> Collections.unmodifiableSet(v));
        LEGAL_TRANSITIONS = Collections.unmodifiableMap(t);
    }

    private final BookingStatusHistoryRepository historyRepository;

    public BookingStateMachine(BookingStatusHistoryRepository historyRepository) {
        this.historyRepository = historyRepository;
    }

    public Set<BookingStatus> legalTargets(BookingStatus from) {
        return LEGAL_TRANSITIONS.getOrDefault(from, Set.of());
    }

    /**
     * Note that a self-transition is never legal: no state lists itself as a
     * target. Callers replaying an event that has already been applied (a
     * duplicate webhook, say) should check this first rather than swallow the
     * resulting exception.
     */
    public boolean canTransition(BookingStatus from, BookingStatus to) {
        return legalTargets(from).contains(to);
    }

    public boolean isTerminal(BookingStatus state) {
        return TERMINAL.contains(state);
    }

    /**
     * Applies a transition, or refuses it. On success the booking's state and
     * stateChangedAt are updated and one history row is appended.
     *
     * The caller is expected to be holding a row lock on the booking
     * (BookingRepository.findByIdForUpdate) - this method checks legality
     * against the state it is handed, so an unlocked read lets two concurrent
     * transitions both pass a check that only one of them should.
     *
     * @param actorUserId who triggered it, or null for machine-driven changes
     *                    (sweepers, payment webhooks)
     * @param note        free text for the audit trail, e.g. the provider ref
     */
    public BookingStatusHistory transition(Booking booking, BookingStatus to, Long actorUserId, String note) {
        BookingStatus from = booking.getState();

        if (!canTransition(from, to)) {
            throw new IllegalBookingTransitionException(from, to);
        }

        Instant now = Instant.now();
        booking.setState(to);
        booking.setStateChangedAt(now);

        BookingStatusHistory entry = historyRepository.save(BookingStatusHistory.builder()
                .booking(booking)
                .fromState(from)
                .toState(to)
                .changedByUserId(actorUserId)
                .note(note)
                .changedAt(now)
                .build());

        log.info("Booking {} transitioned {} -> {} (actor={})",
                booking.getId(), from, to, actorUserId == null ? "system" : actorUserId);

        return entry;
    }

    /**
     * The one history row with a null from_state, written when a hold becomes
     * a booking. Kept separate from {@link #transition} because there is no
     * prior state to validate against.
     */
    public BookingStatusHistory recordCreation(Booking booking, Long actorUserId, String note) {
        return historyRepository.save(BookingStatusHistory.builder()
                .booking(booking)
                .fromState(null)
                .toState(booking.getState())
                .changedByUserId(actorUserId)
                .note(note)
                .changedAt(booking.getStateChangedAt())
                .build());
    }
}
