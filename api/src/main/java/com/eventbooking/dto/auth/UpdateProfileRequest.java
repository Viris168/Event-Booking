package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * The parts of your own record you are allowed to change.
 *
 * <p>Two fields, and the omissions are the design. {@code phone_e164} is the
 * login identity and the JWT's subject, so changing it here would invalidate
 * every token the caller holds and hand them an account they can no longer sign
 * in to. {@code role} and {@code is_disabled} are decisions the platform makes
 * about a user, never the user about themselves - a self-service role field is
 * a privilege escalation with a form in front of it. {@code password_hash} has
 * its own endpoint because it needs the current password first.
 *
 * <p>{@code email} is nullable on purpose: it is optional at registration and
 * clearing it has to stay possible. A blank string is normalised to null rather
 * than stored, so the UNIQUE index never has to arbitrate between "" and "".
 */
public record UpdateProfileRequest(

        @NotBlank
        @JsonProperty("display_name") String displayName,

        /** Null or blank clears it. Non-null must be unique across app_user. */
        @Email String email
) {
}
