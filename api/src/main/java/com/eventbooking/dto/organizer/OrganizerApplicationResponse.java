package com.eventbooking.dto.organizer;

import com.eventbooking.Enumeration.OrganizerApplicationStatus;

import java.time.Instant;

/**
 * One application, as both audiences see it: the applicant reading their own
 * history, and the admin working the review queue.
 *
 * <p>One record rather than two because the fields are the same ones - the
 * difference is who is allowed to see them, which is an authorization question
 * and belongs in the service, not in a second near-identical DTO that drifts.
 *
 * <p>{@code applicantName} and {@code reviewedByName} rather than bare ids, for
 * the reason {@link com.eventbooking.dto.event.EventReviewResponse} gives: the
 * queue row reads "Sokha Chan applied" and making the client resolve a user id
 * to render one line is a round trip for something the server already had.
 *
 * <p>One thing to decide when you write the service: {@code reviewedByName}
 * names the individual admin who rejected someone. That is useful in the admin
 * table and questionable in the applicant's own view - consider passing null
 * for it there, and leaving {@code adminNote}, which the applicant is owed.
 */
public record OrganizerApplicationResponse(

        Long id,

        /** app_user.id of the applicant. */
        Long userId,
        String applicantName,

        String orgNameEn,
        String orgNameKm,
        String telegramHandle,
        String facebookUrl,
        String eventTypes,

        /** The applicant's note to the reviewer. */
        String message,

        OrganizerApplicationStatus status,

        /** The reviewer's reason. Always present on REJECTED, enforced by a DB CHECK. */
        String adminNote,

        /** app_user.id of the deciding admin. Null exactly while PENDING. */
        Long reviewedBy,
        String reviewedByName,
        Instant reviewedAt,

        Instant submittedAt
) {
}
