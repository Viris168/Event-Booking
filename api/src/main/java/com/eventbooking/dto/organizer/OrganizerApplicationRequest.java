package com.eventbooking.dto.organizer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * What a signed-in customer fills in to ask for an organiser account.
 *
 * <p>The applicant is never in the body. Their {@code app_user.id} comes from
 * the authenticated principal, for the same reason the catalog write endpoints
 * stopped taking an owner id from the client: a field the caller controls is
 * not an identity.
 *
 * <p>Both names are {@code @NotBlank} because {@code organizer_profile
 * .org_name_km} is NOT NULL (V1) and approval copies these straight across.
 * Letting a blank Khmer name through would move the failure from this form,
 * where the applicant can fix it, to the admin's approve click, where it
 * surfaces as a constraint violation on an action that looks unrelated.
 */
public record OrganizerApplicationRequest(

        @NotBlank
        @Size(max = 200)
        String orgNameEn,

        @NotBlank
        @Size(max = 200)
        String orgNameKm,

        /** A contact handle such as {@code @sokha} - not a Telegram chat id. */
        @Size(max = 100)
        String telegramHandle,

        @Size(max = 500)
        String facebookUrl,

        /** Free text, e.g. "Concert, Conference". Shown to the reviewer, never queried. */
        @Size(max = 500)
        String eventTypes,

        /** The applicant's note to the reviewer. Optional. */
        @Size(max = 2000)
        String message
) {
}
