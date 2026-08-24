package com.eventbooking.payment;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.booking.BookingStateMachine;
import com.eventbooking.model.Booking;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.ticket.TicketService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What happens on this side once ABA PayWay says a transaction was approved:
 * the booking is walked to CONFIRMED and its tickets are issued.
 *
 * <p>The Bakong lane already did this inside {@code PaymentService.settle}. The
 * PayWay lane had no equivalent - it recorded the approval against its own
 * {@code payments} row and stopped there - so a customer who genuinely paid
 * stayed at PENDING_PAYMENT forever and never got a ticket. This is that
 * missing half.
 *
 * <p><b>Both writes share one transaction</b>, for the same reason the Bakong
 * lane does: a customer whose payment succeeded but whose tickets quietly
 * failed has no way to find out until the gate turns them away. Either both
 * land or neither does, and if neither, the PayWay row stays PENDING and the
 * next status poll tries again.
 */
@Service
public class PaywaySettlementService {

    private static final Logger log = LoggerFactory.getLogger(PaywaySettlementService.class);

    private final BookingRepository bookingRepository;
    private final BookingStateMachine stateMachine;
    private final TicketService ticketService;

    public PaywaySettlementService(BookingRepository bookingRepository,
                                   BookingStateMachine stateMachine,
                                   TicketService ticketService) {
        this.bookingRepository = bookingRepository;
        this.stateMachine = stateMachine;
        this.ticketService = ticketService;
    }

    /**
     * The booking's current state, without touching it.
     *
     * <p>Exists so a client polling an already-settled transaction can be told
     * where its booking got to without that poll taking a row lock and
     * re-running issuance every few seconds.
     *
     * @return null when there is no such booking, or no booking at all
     */
    @Transactional(readOnly = true)
    public BookingStatus stateOf(Long bookingId) {
        if (bookingId == null) {
            return null;
        }
        return bookingRepository.findById(bookingId).map(Booking::getState).orElse(null);
    }

    /**
     * Confirms the booking behind an approved PayWay transaction and issues its
     * tickets.
     *
     * <p>Safe to call repeatedly: a booking already at CONFIRMED writes no
     * history row, and issuance counts what each line already has and creates
     * only the shortfall. That matters because the frontend polls
     * check-transaction on a timer, and two polls can both see the approval.
     *
     * @param bookingId the booking the transaction was opened for; null for a
     *                  bare gateway test, which settles nothing
     * @param tranId    PayWay's transaction id, recorded in the audit trail
     * @return the booking's state afterwards, or null when there was no booking
     */
    @Transactional
    public BookingStatus settle(Long bookingId, String tranId) {
        if (bookingId == null) {
            return null;
        }

        // Row lock before reading the state: two polls landing together must not
        // both see PENDING_PAYMENT and both try to confirm.
        Booking booking = bookingRepository.findByIdForUpdate(bookingId).orElse(null);
        if (booking == null) {
            log.error("PayWay transaction {} names booking {}, which does not exist", tranId, bookingId);
            return null;
        }

        String note = "ABA_PAYWAY " + tranId;

        if (booking.getState() == BookingStatus.CONFIRMED) {
            // Already confirmed - by an earlier poll, or by the other payment
            // lane. Still run issuance: this is the path that repairs a booking
            // whose confirmation landed but whose ticket write did not.
            ticketService.issueForBooking(booking);
            return BookingStatus.CONFIRMED;
        }

        if (stateMachine.isTerminal(booking.getState())
                || booking.getState() == BookingStatus.REFUND_REQUESTED) {
            // The booking died - expired, cancelled, refunded - and the money
            // arrived anyway. Confirming would re-sell inventory that has already
            // gone back to the pool, so it is left alone for a human to refund.
            log.error("PayWay transaction {} was approved after booking {} reached {}; manual refund required",
                    tranId, bookingId, booking.getState());
            return booking.getState();
        }

        if (booking.getState() == BookingStatus.PAYMENT_FAILED) {
            stateMachine.transition(booking, BookingStatus.PENDING_PAYMENT, null, "Late settlement");
        }
        if (booking.getState() == BookingStatus.PENDING_PAYMENT) {
            stateMachine.transition(booking, BookingStatus.AWAITING_CONFIRMATION, null, note);
        }
        stateMachine.transition(booking, BookingStatus.CONFIRMED, null, note);

        ticketService.issueForBooking(booking);

        log.info("PayWay transaction {} confirmed booking {}", tranId, bookingId);
        return BookingStatus.CONFIRMED;
    }
}
