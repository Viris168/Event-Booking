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
 */
@Schema(description = "The result of scanning one code at the gate.")
public record ScanResponse(

        boolean admitted,
        ScanOutcome outcome,
        String message,
        ScannedTicket ticket,
        Instant previousCheckInAt
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

    public static ScanResponse refused(ScanOutcome outcome, String message) {
        return new ScanResponse(false, outcome, message, null, null);
    }

    public static ScanResponse refused(ScanOutcome outcome, String message,
                                       ScannedTicket ticket, Instant previousCheckInAt) {
        return new ScanResponse(false, outcome, message, ticket, previousCheckInAt);
    }

    public static ScanResponse admitted(ScannedTicket ticket) {
        return new ScanResponse(true, ScanOutcome.VALID, "Admit one.", ticket, null);
    }
}
