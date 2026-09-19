package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.Role;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * What a platform admin may change about somebody else's account.
 *
 * <p>Wider than {@link com.eventbooking.dto.auth.UpdateProfileRequest}, and the
 * two extra fields are the reason this record exists rather than the self-service
 * one being reused:
 *
 * <ul>
 *   <li><b>phone</b> is the login identifier, which is exactly why its owner
 *       cannot edit it - changing it would invalidate their own session and
 *       hand them an account they can no longer sign in to. An admin correcting
 *       a mistyped number on somebody else's account has neither problem, and
 *       it is the one repair that screen is most often opened for.</li>
 *   <li><b>role</b> is a decision the platform makes about a user, never the
 *       user about themselves. A self-service role field is a privilege
 *       escalation with a form in front of it; here it is the whole point.</li>
 * </ul>
 *
 * <p>{@code password_hash} and {@code provider_subject} stay absent. The first
 * is a credential an admin has no business setting on another person's behalf,
 * and the second is Google's identifier for them - editable only by linking.
 *
 * <p>{@code is_disabled} is absent too: it already has its own pair of
 * endpoints, and disabling is a decision that deserves its own confirmation
 * rather than riding along inside a save of four unrelated fields.
 */
public record AdminUserUpdateRequest(

        @NotBlank
        @JsonProperty("display_name") String displayName,

        /** Null or blank clears it. Non-null must be unique across app_user. */
        @Email String email,

        /**
         * Null or blank clears it - but only for an account that has another
         * way in; see AdminUserService.update. Both spellings are legal, per
         * V25: 012345678 and +85512345678 are the same line.
         */
        /*
         * The empty alternative is load-bearing. @Pattern skips null but NOT
         * "", so without it a cleared phone box fails here as a flat "request
         * validation failed" - and the admin never sees the refusal that
         * actually applies, which is AdminUserService's: you may not clear the
         * phone of an account that has no other way to sign in. A blank value
         * has to reach the service for that rule to be the one that answers.
         */
        @Pattern(regexp = "^$|^(\\+855|0)[0-9]{8,9}$",
                message = "must be a Cambodian number, e.g. 012345678 or +85512345678")
        @JsonProperty("phone_e164") String phoneE164,

        @NotNull Role role,

        /**
         * The organisation name, required only when this request is what first
         * makes the person an ORGANIZER.
         *
         * <p>Promotion creates the {@code organizer_profile} row that ownership
         * columns point at - the same row OrganizerServiceimpl.approve creates -
         * and that row has to carry a name. Ignored for every other role.
         *
         * <p>Someone demoted earlier still has their profile, so re-promoting
         * them needs no name. Supplying one renames the organisation rather than
         * being dropped: the dialog cannot see the dormant row, so it asks for a
         * name on every promotion, and silently discarding what an admin typed
         * and watched save would be worse than applying it.
         */
        @JsonProperty("org_name_en") String orgNameEn,

        @JsonProperty("org_name_km") String orgNameKm
) {
}
