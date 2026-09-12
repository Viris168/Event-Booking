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

    /** HS256 needs 256 bits of key material, i.e. 32 bytes. */
    static final int MIN_SECRET_LENGTH = 32;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.access-expiration-ms}") long accessExpirationMs) {

        // Checked before handing the bytes to jjwt so the message names the
        // setting to fix. Left to Keys.hmacShaKeyFor, a blank secret surfaces as
        // "The specified key byte array is 0 bits", buried under four layers of
        // BeanCreationException - which is a miserable thing to hand a teammate
        // whose only mistake was copying .env.example.
        //
        // Note an EMPTY value is not the same as an absent one: Spring only
        // applies the ${...:default} fallback when the property is missing, so
        // `JWT_SECRET=` in a .env overrides the default with "" and the app
        // would refuse to start.
        String trimmed = secret == null ? "" : secret.trim();
        if (trimmed.length() < MIN_SECRET_LENGTH) {
            throw new IllegalStateException(
                    "app.jwt.secret (JWT_SECRET) must be at least " + MIN_SECRET_LENGTH
                            + " characters; got " + trimmed.length() + ". Generate one with:"
                            + " openssl rand -base64 48");
        }

        this.key = Keys.hmacShaKeyFor(trimmed.getBytes(StandardCharsets.UTF_8));
        this.accessExpirationMs = accessExpirationMs;
    }

    /**
     * Mints an access token for a user who has already proven who they are.
     *
     * <p>The subject is {@code app_user.id}. It used to be {@code phone_e164},
     * which read nicely and was wrong in two ways. A phone number is a business
     * value, not an identity: it is nullable since V9, so a Google account -
     * which arrives with an email and no phone - was issued a token with a
     * <b>null subject</b> that no later request could resolve. And even for a
     * local account it is mutable in principle, so a token would outlive the
     * fact it names. The primary key is neither.
     *
     * <p>Tokens minted before this change carry a phone number and no longer
     * resolve. That self-heals: they expire in 15 minutes, and a refresh issues
     * a new one. {@link AppUserDetailsService} treats an unparseable subject as
     * "no such user" rather than letting it escape as a 500.
     *
     * <p>Role travels as a claim purely to save a database read on requests that
     * only need to check authority. It is a snapshot from issue time: promote a
     * user and their existing token still carries the old role until it expires.
     * For a 15-minute token that is an acceptable trade; anything sensitive
     * should re-read the user.
     */
    public String generateAccessToken(String subject, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(subject)
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(accessExpirationMs)))
                .signWith(key)
                .compact();
    }

    /**
     * Returns the app_user id this token was issued for, or null if the token
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
