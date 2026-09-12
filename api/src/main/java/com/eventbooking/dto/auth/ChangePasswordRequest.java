package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Replacing your password, proving first that you know the old one.
 *
 * <p>{@code currentPassword} is what makes this endpoint safe to expose to a
 * live session. An access token is a bearer credential: anyone who has lifted
 * one - a shared laptop, a borrowed phone still signed in - can spend it. Asking
 * for the existing password means a stolen token alone cannot be used to lock
 * the real owner out of their own account.
 *
 * <p>The same 8-character floor as {@link RegisterRequest}, for the same reason:
 * length is what costs an attacker time, and composition rules mostly push
 * people towards predictable substitutions.
 */
public record ChangePasswordRequest(

        @NotBlank
        @JsonProperty("current_password") String currentPassword,

        @NotBlank
        @Size(min = 8, message = "must be at least 8 characters")
        @JsonProperty("new_password") String newPassword
) {
}
