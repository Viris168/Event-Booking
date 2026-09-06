package com.eventbooking.dto.event;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The reviewer's reason, for the two decisions the organiser has to act on.
 *
 * <p>@NotBlank mirrors the CHECK on event_review: without it a missing message
 * reaches the database and comes back as a raw constraint violation the error
 * handler has no case for - a 500 where the caller deserved "message is
 * required".
 */
public record ReviewDecisionRequest(
        @NotBlank @Size(max = 2000) String message
) {
}
