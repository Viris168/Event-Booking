package com.eventbooking.dto.organizer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The reviewer's reason for turning an application down.
 *
 * <p>{@code @NotBlank} mirrors {@code organizer_application_note_required}, the
 * CHECK on the table: without it a missing note reaches the database and comes
 * back as a raw constraint violation the error handler has no case for - a 500
 * where the caller deserved "message is required".
 *
 * <p>Deliberately not a reuse of {@link com.eventbooking.dto.event.ReviewDecisionRequest},
 * which is the same shape. That record is part of the event review vocabulary
 * and lives in {@code dto.event}; sharing it would couple two lifecycles that
 * have no reason to change together, and the first time one of them needs a
 * second field the shared record grows an option the other ignores.
 *
 * <p>There is no approve counterpart. An approval has nothing to explain, so it
 * carries no body - see AdminEventController.approve.
 */
public record RejectApplicationRequest(
        @NotBlank @Size(max = 2000) String message
) {
}
