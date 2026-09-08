package com.eventbooking.dto.ticket;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record GroupComfirm(
        @NotBlank(message = "payload is required")
        String payload,
        @NotNull Long eventId,
        @NotBlank String admit
) {
}
