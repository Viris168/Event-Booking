package com.eventbooking.dto.ticket;

import com.fasterxml.jackson.annotation.JsonAlias;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * What a gate scanner sends: exactly what came off the camera, untouched.
 *
 * @param payload whatever the scanner read. It is not validated here beyond
 *                being present - deciding whether a string is one of our
 *                tickets is the whole job of the endpoint, and a 400 for a
 *                misread barcode would tell a steward nothing useful
 * @param eventId the event whose gate this is. <b>Required.</b> It was
 *                optional once, and optional meant a gate that forgot it
 *                admitted every event's tickets - "a valid ticket" instead of
 *                "a valid ticket for tonight". It is also what the caller is
 *                authorized against, so there is no longer a coherent scan
 *                without it
 */
public record ScanTicketRequest(

        @Schema(description = "The scanned string, e.g. EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ",
                requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "payload is required")
        String payload,

        /* The API serializes snake_case globally, so this field's wire name is
           event_id. The alias exists because an unknown property is silently
           dropped rather than refused: a scanner that sent the camelCase name
           got eventId = null and admitted every event's tickets. That is now a
           400 rather than a silent hole, but the alias stays - a scanner in the
           field should not start failing over a spelling we already accept. */
        @Schema(description = "The gate's event. Wire name is event_id; eventId is accepted too.",
                requiredMode = Schema.RequiredMode.REQUIRED, example = "1")
        @NotNull(message = "event_id is required: the gate must name its event")
        @JsonAlias("eventId")
        Long eventId
) {
}
