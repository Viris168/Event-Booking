package com.eventbooking.dto.notification;

import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.model.Notification;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.Map;

/**
 * One inbox row, as the client reads it.
 *
 * <p>There is no {@code message} field, and that is the design rather than an
 * omission. The server does not know what language the reader has selected -
 * the locale is a toggle in the navbar, not a column on the account - so the
 * only honest thing it can send is what happened and the nouns involved. The
 * browser turns that into a sentence through the same dictionary that renders
 * the rest of the chrome, which is also why flipping to Khmer re-renders every
 * notification already on screen instead of only the new ones.
 *
 * @param params the sentence's nouns, e.g. {@code bookingRef}, {@code titleEn},
 *               {@code titleKm}. Keys stay camelCase: the SNAKE_CASE naming
 *               strategy renames record components, not the contents of a Map,
 *               so what is written here is exactly what the client reads
 */
@Schema(description = "A single notification, addressed to the authenticated user.")
public record NotificationResponse(

        Long id,
        NotificationType type,
        Map<String, Object> params,

        @Schema(description = "Client-side route to open when clicked", example = "/bookings/42")
        String linkUrl,

        @Schema(description = "Null while unread")
        Instant readAt,

        Instant createdAt
) {
    public static NotificationResponse from(Notification n) {
        return new NotificationResponse(
                n.getId(),
                n.getType(),
                n.getParams() == null ? Map.of() : n.getParams(),
                n.getLinkUrl(),
                n.getReadAt(),
                n.getCreatedAt());
    }
}
