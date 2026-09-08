package com.eventbooking.dto.ticket;

import com.fasterxml.jackson.annotation.JsonAlias;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Hand an admission back.
 *
 * @param eventId the gate the operator is authorized against, and a second
 *                check that the ticket belongs here - owning event 5 is no
 *                licence to reverse admissions at event 9
 * @param reason  required, and written to the audit trail beside the operator's
 *                id. An undo with no stated cause cannot be told apart from an
 *                abuse of one, and this is the only gate action that gives an
 *                admission back
 */
public record UndoCheckInRequest(

        @Schema(description = "The event this ticket's gate belongs to. Wire name is event_id.",
                requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "event_id is required")
        @JsonAlias("eventId")
        Long eventId,

        @Schema(description = "Why. Recorded against the operator in scan_log.",
                requiredMode = Schema.RequiredMode.REQUIRED,
                example = "Scanned the wrong person in a queue")
        @NotBlank(message = "reason is required: an undo has to say why")
        @Size(max = 500, message = "reason must be 500 characters or fewer")
        String reason
) {
}
