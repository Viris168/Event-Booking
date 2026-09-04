package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;

import java.time.Instant;
import java.util.List;

/**
 * One entry in an event's review history, and the shape the organiser's status
 * banner renders.
 *
 * <p>{@code actorName} rather than an id: the banner says "Chanthou Vann asked
 * for changes", and making the client resolve a user id to render one line of
 * text is a second round trip for something the server already had loaded.
 */
public record EventReviewResponse(
        Long id,
        EventTransition action,
        String message,
        Long actorId,
        String actorName,
        EventStatus fromStatus,
        EventStatus toStatus,
        Instant createdAt,
        /** What changed since the previous snapshot. Empty when there is no baseline. */
        List<FieldChange> changes
) {
    public record FieldChange(String field, String before, String after) {}
}
