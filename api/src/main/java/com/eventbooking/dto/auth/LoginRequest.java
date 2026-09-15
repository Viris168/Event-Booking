package com.eventbooking.dto.auth;

import jakarta.validation.constraints.NotBlank;

/**
 * Credentials offered at sign-in.
 *
 * @param identifier a phone number or an email address - whichever the account
 *        holder remembers. Not validated to a shape here on purpose: a rejection
 *        that says "that is not a valid phone number" tells an unauthenticated
 *        caller what the field expects, and the endpoint answers every failure
 *        with the same {@code INVALID_CREDENTIALS} anyway.
 * @param password the raw password, hashed for comparison and never stored.
 */
public record LoginRequest(

        @NotBlank String identifier,

        @NotBlank String password
) {
}
