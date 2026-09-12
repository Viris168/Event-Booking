package com.eventbooking.dto.notification;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * The badge number.
 *
 * <p>An object rather than a bare number in the body: this endpoint is polled on
 * a timer for the life of every session, so it is the one most likely to grow a
 * second field later (a newest-id, to decide whether to animate). A bare
 * {@code 3} would have to become a breaking change to do that.
 */
@Schema(description = "How many notifications the caller has not opened.")
public record UnreadCountResponse(long unread) {
}
