package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

/**
 * Exchanges credentials for a token pair.
 *
 * <p>Deliberately looser than {@link RegisterRequest}: no {@code @Pattern} on
 * the phone and no {@code @Size} on the password. Validating the shape of a
 * login attempt tells an attacker which inputs are even worth trying, and a
 * wrong password must be indistinguishable from a malformed one. Both end in
 * the same 401 with the same message.
 */
public record LoginRequest(

        @NotBlank
        @JsonProperty("phone_e164") String phoneE164,

        @NotBlank String password
) {
}
