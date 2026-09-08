package com.eventbooking.dto.ticket;

import com.eventbooking.ticket.ScanOutcome;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

/**
 * The answer at the gate. Always HTTP 200 — see {@link ScanOutcome} for why a
 * refused ticket is a successful call.
 *
 * @param admitted          the only field a turnstile needs. Green or red
 * @param outcome           why, for the steward's screen
 * @param message           that reason in words, ready to display
 * @param ticket            who this is, when it is known - so a steward can
 *                          check a name and see the seat. Null when the code
 *                          could not be tied to a ticket at all
 * @param previousCheckInAt when the ticket was used the first time. Populated
 *                          only for ALREADY_CHECKED_IN, and the single most
 *                          useful thing to show: "23 seconds ago" is a
 *                          double-scan, "two hours ago" is a passed-back ticket
 * @param booking           how far through this booking's tickets the gate is.
 *                          Null when the code could not be tied to a ticket
 */
@Schema(description = "The result of scanning one code at the gate.")
public record ScanResponse(

        boolean admitted,
        ScanOutcome outcome,
        String message,
        ScannedTicket ticket,
        Instant previousCheckInAt,
        BookingProgress booking
) {

    /**
     * The subset of a ticket a gate is allowed to see. Deliberately <b>not</b>
     * {@link TicketResponse}: that carries {@code qrPayload}, and echoing a
     * bearer secret back to whoever scanned it would let a scanner harvest
     * working tickets.
     */
    @Schema(description = "Enough to identify the holder at the door. Never includes the QR payload.")
    public record ScannedTicket(
            Long ticketId,
            String bookingRef,
            String buyerName,
            String eventTitleEn,
            String tierName,
            String seatLocation,
            Integer unitSeq,
            Integer unitsInLine
    ) {
    }

    /**
     * The rest of the party.
     *
     * <p>A zone line bought for four is four separate codes, and the steward
     * scanning them one by one has no way to know how many are left. This is
     * the cheap answer to that - the full group flow (scan one, admit N) is a
     * separate endpoint, and this field is what makes the interim tolerable.
     *
     * @param total     tickets on the whole booking, across every line
     * @param checkedIn how many have been admitted, <b>including this scan</b>
     *                  when it succeeded
     */
    @Schema(description = "Progress through the booking this ticket belongs to.")
    public record BookingProgress(long total, long checkedIn, long remaining) {

        public static BookingProgress of(long total, long checkedIn) {
            return new BookingProgress(total, checkedIn, Math.max(0, total - checkedIn));
        }
    }

    public static ScanResponse refused(ScanOutcome outcome, String message) {
        return new ScanResponse(false, outcome, message, null, null, null);
    }

    public static ScanResponse refused(ScanOutcome outcome, String message,
                                       ScannedTicket ticket, Instant previousCheckInAt,
                                       BookingProgress booking) {
        return new ScanResponse(false, outcome, message, ticket, previousCheckInAt, booking);
    }

    public static ScanResponse admitted(ScannedTicket ticket, BookingProgress booking) {
        return new ScanResponse(true, ScanOutcome.VALID, "Admit one.", ticket, null, booking);
    }
}
