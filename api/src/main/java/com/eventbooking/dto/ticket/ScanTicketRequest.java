package com.eventbooking.dto.ticket;

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

        @Schema(description = "Strongly recommended: without it, a valid ticket for a "
                + "different event is admitted.", example = "1")
        Long eventId
) {
}
