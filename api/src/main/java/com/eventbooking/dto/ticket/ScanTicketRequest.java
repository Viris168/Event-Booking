package com.eventbooking.dto.ticket;

import com.fasterxml.jackson.annotation.JsonAlias;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/**
 * What a gate scanner sends: exactly what came off the camera, untouched.
 *
 * @param payload whatever the scanner read. It is not validated here beyond
 *                being present - deciding whether a string is one of our
 *                tickets is the whole job of the endpoint, and a 400 for a
 *                misread barcode would tell a steward nothing useful
 * @param eventId the event whose gate this is. Optional, but passing it is what
 *                turns "a valid ticket" into "a valid ticket for tonight" -
 *                without it, last month's ticket scans green
 */
public record ScanTicketRequest(

        @Schema(description = "The scanned string, e.g. EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ",
                requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "payload is required")
        String payload,

        /* The API serializes snake_case globally, so this field's wire name is
           event_id. The alias exists because an unknown property is silently
           dropped rather than refused: a scanner that sent the camelCase name
           got eventId = null and admitted every event's tickets, which is the
           one failure this field is here to prevent. Accept both spellings
           rather than let that happen quietly again. */
        @Schema(description = "Strongly recommended: without it, a valid ticket for a "
                + "different event is admitted. Wire name is event_id; eventId is "
                + "accepted too.", example = "1")
        @JsonAlias("eventId")
        Long eventId
) {
}
