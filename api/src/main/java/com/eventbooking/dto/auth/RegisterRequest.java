package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Creates a LOCAL account - phone plus a password this service hashes.
 *
 * <p>Google accounts never come through here: they arrive already proven by
 * Google and are created by the sign-in endpoint instead, which is why
 * {@code app_user.password_hash} is nullable.
 */
public record RegisterRequest(

        /* Mirrors the CHECK on app_user.phone_e164, so a bad number is a clean
           422 from validation rather than a 23514 raised by Postgres. */
        @NotBlank
        @Pattern(regexp = "^\\+855[0-9]{8,9}$",
                message = "must be a Cambodian E.164 number, e.g. +85512345678")
        @JsonProperty("phone_e164") String phoneE164,

        /* Only a floor is enforced. Composition rules ("one capital, one
           symbol") push people towards predictable substitutions; length is
           what actually costs an attacker time. */
        @NotBlank
        @Size(min = 8, message = "must be at least 8 characters")
        String password,

        @NotBlank
        @JsonProperty("display_name") String displayName,

        /* Optional: app_user.email is UNIQUE but nullable, because phone is the
           identifier in this product. */
        @Email String email
) {
}
