package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;

/**
 * The ID token the browser received from Google Identity Services.
 *
 * <p>One field, and it is the whole credential. Nothing else from the client is
 * believed: the email, the name and the account's permanent id are read out of
 * the token after its signature is checked, never taken from the request body.
 * A payload carrying its own {@code email} would be a way to sign in as anyone.
 */
public record GoogleLoginRequest(
        @NotBlank @JsonProperty("id_token") String idToken) {
}
