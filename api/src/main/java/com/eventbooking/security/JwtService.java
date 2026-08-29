package com.eventbooking.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

/**
 * Issues and reads the short-lived access token.
 *
 * <p>A JWT is three dot-separated parts: a header, the claims (who this is, when
 * it expires), and a signature over both. The first two are only base64 - anyone
 * holding the token can read them, so <b>never put a secret in a claim</b>. What
 * the signature buys is tamper-evidence: change a single character of the claims
 * and the signature stops matching, because only this service knows the key.
 *
 * <p>That is why nothing is stored server-side. We do not keep a list of issued
 * access tokens; we re-verify the signature on every request. The cost is that a
 * token cannot be revoked before it expires, which is the whole reason the access
 * token is 15 minutes and revocation lives on the refresh token instead (#19).
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long accessExpirationMs;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.access-expiration-ms}") long accessExpirationMs) {

        // HS256 requires at least 256 bits of key material. Keys.hmacShaKeyFor
        // enforces that and throws on a short secret, which is the failure you
        // want - a silently weak signing key is worse than a startup crash.
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessExpirationMs = accessExpirationMs;
    }

    /**
     * Mints an access token for a user who has already proven who they are.
     *
     * <p>The subject is {@code phone_e164} rather than the numeric id, so it
     * matches what {@link AppUserDetailsService#loadUserByUsername} expects and
     * the filter can hand it straight back without a translation step.
     *
     * <p>Role travels as a claim purely to save a database read on requests that
     * only need to check authority. It is a snapshot from issue time: promote a
     * user and their existing token still carries the old role until it expires.
     * For a 15-minute token that is an acceptable trade; anything sensitive
     * should re-read the user.
     */
    public String generateAccessToken(String phoneE164, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(phoneE164)
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(accessExpirationMs)))
                .signWith(key)
                .compact();
    }

    /**
     * Returns the phone number this token was issued for, or null if the token
     * is unusable for any reason - bad signature, expired, malformed, or simply
     * not a JWT at all.
     *
     * <p>Everything is collapsed into null on purpose. The caller is a servlet
     * filter that must treat every failure identically: no authentication, carry
     * on. Distinguishing "expired" from "forged" in a response would tell an
     * attacker which of their guesses was closer.
     */
    public String extractPhoneOrNull(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return claims.getSubject();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
