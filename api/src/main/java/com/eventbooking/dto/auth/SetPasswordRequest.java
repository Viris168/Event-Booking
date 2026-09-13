package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The first password on an account that has never had one.
 *
 * <p>No {@code currentPassword}, unlike {@link ChangePasswordRequest}, because
 * there is nothing to prove knowledge of. What stands in its place is the
 * bearer token: the caller is already signed in as this account, which is the
 * same proof {@code /auth/me} accepts before showing them everything else about
 * it.
 *
 * <p>Same 8-character floor as {@link RegisterRequest}. Length is what costs an
 * attacker time; composition rules mostly push people towards predictable
 * substitutions.
 */
public record SetPasswordRequest(

        @NotBlank
        @Size(min = 8, message = "must be at least 8 characters")
        @JsonProperty("new_password") String newPassword) {
}
