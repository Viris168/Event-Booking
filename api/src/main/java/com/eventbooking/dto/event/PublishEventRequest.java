package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.EventStatus;
import jakarta.validation.constraints.NotNull;

public record PublishEventRequest(
        @NotNull EventStatus targetStatus
) {
}
