package com.eventbooking.dto.ticket;

import com.fasterxml.jackson.annotation.JsonAlias;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * What a gate sends to look up a whole party: any one of its codes.
 *
 * <p>Deliberately the QR and not a booking id. The server resolves which
 * booking is being previewed from the signature, so a scanner cannot name
 * somebody else's party and read their guest list.
 *
 * @param payload any single ticket's scanned string. The rest of the booking is
 *                found from it
 * @param eventId the gate's event. Required for the same reason as on
 *                {@link ScanTicketRequest}, and it is what the caller is
 *                authorized against
 */
public record GroupScanRequest(

        @Schema(description = "Any one ticket from the party, e.g. EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ",
                requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "payload is required")
        String payload,

        @Schema(description = "The gate's event. Wire name is event_id; eventId is accepted too.",
                requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "event_id is required: the gate must name its event")
        @JsonAlias("eventId")
        Long eventId
) {
}
