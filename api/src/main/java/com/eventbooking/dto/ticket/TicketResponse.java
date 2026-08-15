package com.eventbooking.dto.ticket;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

/**
 * One ticket, as its owner sees it.
 *
 * @param qrPayload    the signed string to render as a QR. Present only for the
 *                     ticket's owner - it is the bearer secret, so anyone
 *                     holding it can walk in
 * @param tierName     the seat class or zone name, whichever the line was
 * @param seatLocation section / row / seat for a seated ticket, null for a zone
 *                     one, where the whole point is that no seat is assigned
 * @param unitSeq      which of the line's admissions this is: "2 of 3"
 */
@Schema(description = "An admission unit - one person through the gate, once.")
public record TicketResponse(

        Long id,
        Long bookingId,
        String bookingRef,
        Long eventId,
        String eventTitleEn,
        String eventTitleKm,
        Instant eventStartsAt,

        String tierName,
        String seatLocation,
        Integer unitSeq,
        Integer unitsInLine,

        @Schema(description = "Render this as a QR image, or GET /api/tickets/{id}/qr.svg "
                + "to have the server draw it.")
        String qrPayload,

        Instant issuedAt,
        boolean checkedIn,
        Instant checkedInAt
) {
}
