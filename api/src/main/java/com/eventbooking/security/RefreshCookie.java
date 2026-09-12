package com.eventbooking.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The refresh token's carrier: an httpOnly cookie rather than a JSON field the
 * browser has to put somewhere.
 *
 * <p>Both tokens used to live in {@code localStorage}, which any script running
 * on the page can read - so one XSS walked away with fourteen days of access.
 * {@code HttpOnly} closes that: JavaScript cannot read this cookie at all, and
 * {@link #SAME_SITE} means it is not attached to requests from other sites.
 *
 * <p>{@code Path} is the narrow part. The cookie is sent only to
 * {@code /api/v1/auth}, so the refresh credential never rides along on a
 * booking or a payment call - endpoints that have no use for it and every
 * opportunity to log it.
 *
 * <p>The access token deliberately does NOT get this treatment. It stays in the
 * {@code Authorization} header, which means no endpoint outside {@code /auth}
 * carries ambient credentials, which in turn is why CSRF is not a concern here
 * even with {@code csrf().disable()}: a cross-site form post reaches
 * {@code /bookings} with no authority at all, and cannot reach
 * {@code /auth/refresh} because of SameSite.
 */
@Component
public class RefreshCookie {

    public static final String NAME = "refresh_token";

    /** Only /auth/refresh and /auth/logout have any use for it. */
    private static final String PATH = "/api/v1/auth";

    /**
     * Strict, not Lax. The frontend and the API are one origin in both
     * environments - Vite proxies /api in development, Caddy routes it in
     * production - so no legitimate request for this cookie is ever cross-site,
     * and the usual reason to soften this (arriving from a link on someone
     * else's page) does not apply to a token endpoint.
     */
    private static final String SAME_SITE = "Strict";

    private final boolean secure;
    private final Duration ttl;

    public RefreshCookie(@Value("${app.auth.refresh-cookie.secure}") boolean secure,
                         @Value("${app.jwt.refresh-expiration-ms}") long refreshExpirationMs) {
        this.secure = secure;
        this.ttl = Duration.ofMillis(refreshExpirationMs);
    }

    /** Carries the token, for exactly as long as the token itself is valid. */
    public ResponseCookie issue(String rawRefreshToken) {
        return base(rawRefreshToken).maxAge(ttl).build();
    }

    /**
     * Expires it. Name, path and flags must match the original or the browser
     * treats this as a different cookie and leaves the real one in place.
     */
    public ResponseCookie clear() {
        return base("").maxAge(0).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                // False only under the dev profile, because localhost is plain
                // HTTP and a Secure cookie would simply never be sent - the
                // session would appear to work until the first refresh.
                .secure(secure)
                .sameSite(SAME_SITE)
                .path(PATH);
    }
}
