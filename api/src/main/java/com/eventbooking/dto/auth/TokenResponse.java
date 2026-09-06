package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * What login and refresh hand back.
 *
 * <p>The two tokens are used differently and should be stored differently. The
 * access token goes on every request and is short-lived precisely because
 * nothing can revoke it. The refresh token is presented only to
 * {@code /auth/refresh}, is the one thing that can end a session early, and is
 * therefore the more damaging of the two to leak.
 *
 * @param accessToken  the 15-minute bearer token
 * @param refreshToken the 14-day opaque token; only its SHA-256 is stored here
 * @param expiresIn    seconds until the ACCESS token expires, so a client can
 *                     refresh ahead of time instead of waiting for a 401
 */
public record TokenResponse(

        @JsonProperty("access_token") String accessToken,

        @JsonProperty("refresh_token") String refreshToken,

        /* Named for the OAuth 2.0 convention (RFC 6749) so any standard client
           library recognises it without translation. */
        @JsonProperty("token_type") String tokenType,

        @JsonProperty("expires_in") long expiresIn
) {

    public static TokenResponse bearer(String accessToken, String refreshToken, long expiresInSeconds) {
        return new TokenResponse(accessToken, refreshToken, "Bearer", expiresInSeconds);
    }
}
