package com.eventbooking.security;

import com.eventbooking.model.AppUser;
import com.eventbooking.model.RefreshToken;
import com.eventbooking.repository.RefreshTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Owns the long-lived half of the token pair.
 *
 * <p>Unlike the access token, a refresh token is <b>opaque</b> - it carries no
 * claims and proves nothing on its own. It is a random string whose only
 * meaning is that a matching row exists here and has not been revoked. That is
 * deliberate: the row has to be read anyway to check revocation, so signing
 * claims into the token as well would add length and a second thing to keep in
 * step, for no gain. The database is the single source of truth.
 *
 * <p>Deliberately not part of {@code JwtService}: none of this is a JWT.
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    /** 256 bits of entropy - the same strength as the signing key. */
    private static final int TOKEN_BYTES = 32;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final RefreshTokenRepository refreshTokenRepository;
    private final Duration refreshTtl;

    public RefreshTokenService(
            RefreshTokenRepository refreshTokenRepository,
            @Value("${app.jwt.refresh-expiration-ms}") long refreshExpirationMs) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTtl = Duration.ofMillis(refreshExpirationMs);
    }

    /**
     * Opens a session and returns the raw token.
     *
     * <p>This is the only moment the raw value exists on this side. It is
     * returned to its owner and then forgotten; what is persisted is the
     * SHA-256 of it, so a reader of a leaked dump cannot resume anyone's
     * session.
     */
    @Transactional
    public String issue(AppUser user, String userAgent) {
        String raw = randomToken();

        refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .tokenHash(sha256(raw))
                .expiresAt(Instant.now().plus(refreshTtl))
                .userAgent(userAgent)
                .build());

        return raw;
    }

    /**
     * Exchanges a live token for a fresh one, revoking the old.
     *
     * <p><b>Rotation, not reuse.</b> Each refresh burns the token it was given.
     * A token stolen from storage is therefore useful only until its owner next
     * refreshes, and a token presented twice is visible as exactly that -
     * whereas a long-lived reusable token would let a thief ride along
     * indefinitely with nothing to see.
     *
     * @return the new raw token, or empty if the presented one was unknown,
     *         already revoked, or expired - all of which the caller must answer
     *         identically, since distinguishing them tells a guesser which of
     *         their attempts was closer
     */
    @Transactional
    public Optional<Rotated> rotate(String rawToken, String userAgent) {
        Instant now = Instant.now();

        Optional<RefreshToken> found = refreshTokenRepository.findByTokenHash(sha256(rawToken));
        if (found.isEmpty()) {
            return Optional.empty();
        }

        RefreshToken existing = found.get();
        if (!existing.isActive(now)) {
            // Worth a log line rather than a silent 401: a REVOKED token coming
            // back is either a client replaying a stale value, or someone using
            // a copy that was taken before the real owner refreshed. The second
            // is the one worth being able to find later.
            log.warn("Refresh token for user {} presented after {}", existing.getUser().getId(),
                    existing.getRevokedAt() != null ? "revocation" : "expiry");
            return Optional.empty();
        }

        existing.setRevokedAt(now);
        AppUser user = existing.getUser();

        return Optional.of(new Rotated(user, issue(user, userAgent)));
    }

    /** Logout everywhere - ends every live session for this user. */
    @Transactional
    public int revokeAll(AppUser user) {
        return refreshTokenRepository.revokeAllForUser(user, Instant.now());
    }

    /** Logout on this device only. Silent if the token is already gone. */
    @Transactional
    public void revoke(String rawToken) {
        refreshTokenRepository.findByTokenHash(sha256(rawToken))
                .filter(token -> token.getRevokedAt() == null)
                .ifPresent(token -> token.setRevokedAt(Instant.now()));
    }

    /** The user a rotation belongs to, plus the token to hand back. */
    public record Rotated(AppUser user, String rawToken) {}

    // ------------------------------------------------------------------

    private static String randomToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        // SecureRandom, never Math.random or java.util.Random: those are
        // predictable from a handful of outputs, which for a session token
        // means forgeable.
        RANDOM.nextBytes(bytes);
        return ENCODER.encodeToString(bytes);
    }

    /**
     * One-way, and the same input always gives the same digest - which is what
     * makes lookup by hash work without ever storing the secret.
     *
     * <p>Plain SHA-256 rather than BCrypt on purpose. A password is short,
     * human-chosen and guessable, so it needs a deliberately slow hash. This
     * token is 256 random bits: there is nothing to guess, and a slow hash here
     * would only make every authenticated refresh slower.
     */
    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is required of every JRE; absent it, the platform is broken.
            throw new IllegalStateException("SHA-256 is unavailable on this JVM", e);
        }
    }
}
