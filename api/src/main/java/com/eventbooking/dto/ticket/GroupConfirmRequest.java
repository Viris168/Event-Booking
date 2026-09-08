package com.eventbooking.dto.ticket;

import com.fasterxml.jackson.annotation.JsonAlias;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * Admit named members of a party, from any one of its codes.
 *
 * <p><b>Ticket ids, not a count.</b> A count was the original design and it is
 * wrong on a mixed booking. Admitting "3" took the first three free tickets in
 * seat order, so three people from the standing area could burn two VIP seats
 * and a Regular one - and the damage only surfaced later, when the person
 * actually holding that VIP seat scanned it and was refused at the door.
 *
 * <p>The distinction the domain forces: a zone ticket is interchangeable, so a
 * count would have been a complete instruction; an assigned seat is a specific
 * person, so it never was. One request shape covers both, and the client turns
 * "admit 3 standing" into three ids because it is the side that knows they are
 * interchangeable.
 *
 * <p>Naming ids is not a way to reach someone else's tickets: every id is
 * checked against the booking resolved from the <em>signed payload</em>, and
 * one that does not belong refuses the whole call.
 *
 * @param ticketIds exactly who is being let in. All must be on the scanned
 *                  booking and all must still be unused - any that is not
 *                  refuses the request rather than admitting the rest, because
 *                  a steward who selected three and silently got two will wave
 *                  three people through
 */
public record GroupConfirmRequest(

        @Schema(description = "Any one ticket from the party", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "payload is required")
        String payload,

        @Schema(description = "The gate's event. Wire name is event_id; eventId is accepted too.",
                requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "event_id is required: the gate must name its event")
        @JsonAlias("eventId")
        Long eventId,

        @Schema(description = "The tickets to admit now. Wire name is ticket_ids.",
                requiredMode = Schema.RequiredMode.REQUIRED, example = "[41, 42, 43]")
        @NotEmpty(message = "ticket_ids is required: name who is being admitted")
        @JsonAlias("ticketIds")
        List<@NotNull Long> ticketIds
) {
}
