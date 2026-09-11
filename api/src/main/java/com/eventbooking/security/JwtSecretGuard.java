package com.eventbooking.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Refuses to start on the JWT secret shipped in this repository.
 *
 * <p>{@link JwtService} already rejects a secret shorter than 32 characters, and
 * that check quietly did nothing about the real risk: the placeholder in
 * {@code application.yml} is 53 characters long, so it sailed through. A deploy
 * that never set {@code JWT_SECRET} came up signing tokens with a key printed in
 * a public file - and an access token is an assertion of <em>who you are</em>, so
 * anyone who could read the repo could mint one for any phone number, including
 * the platform admin's.
 *
 * <p>A length check answers "is this key big enough to resist guessing". It
 * cannot answer "does anyone else already have it". Those are different
 * questions and need separate checks; this is the second one.
 *
 * <p>Built as its own bean rather than another {@code if} in {@code JwtService}
 * for the same reason {@link com.eventbooking.ticket.TicketSecretGuard} is:
 * {@code JwtService} is constructed directly by tests, and making it
 * profile-aware would drag an {@code Environment} into what is otherwise a
 * small piece of cryptography.
 *
 * <p>{@code @Profile("!dev")} so it fails <b>closed</b>. A production deploy
 * that forgets to set a profile must break, not silently become the insecure
 * case. Local runs opt in with {@code -Dspring-boot.run.profiles=dev}, and
 * {@code application-dev.yml} supplies a dev-only key.
 */
@Component
@Profile("!dev")
public class JwtSecretGuard {

    /**
     * The value shipped in {@code application.yml}. Compared by name rather
     * than by length, because its length is exactly what made it slip past the
     * existing check.
     */
    public static final String PLACEHOLDER_SECRET =
            "change-this-to-a-long-random-secret-at-least-32-chars";

    public JwtSecretGuard(@Value("${app.jwt.secret}") String secret) {
        if (PLACEHOLDER_SECRET.equals(secret == null ? null : secret.trim())) {
            throw new IllegalStateException("""
                    app.jwt.secret (JWT_SECRET) is still the placeholder shipped in this \
                    repository. It is long enough to pass the length check and public \
                    enough that anyone who can read the repo can sign a token claiming to \
                    be any user, including a platform admin.

                    Generate one with:  openssl rand -base64 48

                    Unlike the ticket signing key, this one can be rotated freely - access \
                    tokens live 15 minutes, so the only cost of changing it is that \
                    everyone signs in again.\
                    """);
        }
    }
}
