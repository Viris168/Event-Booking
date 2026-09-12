package com.eventbooking.security;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.eventbooking.security.error.InvalidGoogleTokenException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collections;

/**
 * Turns a Google ID token into the three facts we are willing to trust.
 *
 * <p>The browser obtains the token from Google Identity Services and posts it
 * here. Nothing about it is taken on trust: {@link GoogleIdTokenVerifier}
 * checks the RSA signature against Google's published keys, that the issuer is
 * Google, that the token has not expired, and - the check that matters most -
 * that the <b>audience is our own client id</b>. Without that last one, an ID
 * token issued to any other application on the internet would sign its bearer
 * in here as whoever it names.
 *
 * <p>Only three claims leave this class. {@code sub} is the account's permanent
 * identifier at Google and the only field safe to key a user row on: an email
 * address can be changed or handed to someone else inside a Workspace domain,
 * and a name is free text. The email and name are carried through for display
 * and for contact, never for identification.
 *
 * <p>{@code email_verified} is required rather than merely read. An unverified
 * address on a Google account is one the user typed, not one Google confirmed
 * they control - accepting it would let someone claim an address that belongs
 * to a different person here.
 */
@Component
public class GoogleTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleTokenVerifier.class);

    /** What a verified token tells us. Nothing else is trusted. */
    public record GoogleIdentity(String subject, String email, String displayName) {}

    private final GoogleIdTokenVerifier verifier;
    private final boolean configured;

    public GoogleTokenVerifier(@Value("${app.auth.google.client-id:}") String clientId) {
        this.configured = clientId != null && !clientId.isBlank();
        /*
         * Built once and reused: the verifier caches Google's signing keys and
         * refreshes them when they rotate. A new instance per request would
         * fetch the key set on every sign-in, turning an outage at Google into
         * an outage here and adding a network round trip to every login.
         */
        this.verifier = configured
                ? new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                        .setAudience(Collections.singletonList(clientId))
                        .build()
                : null;
        if (!configured) {
            log.info("Google sign-in is off: app.auth.google.client-id is not set.");
        }
    }

    /** False when no client id is configured, so the endpoint can answer 501 rather than 500. */
    public boolean isConfigured() {
        return configured;
    }

    /**
     * @throws InvalidGoogleTokenException for every failure - a bad signature, a
     *         wrong audience, an expired token and an unverified email are all
     *         the same answer to the caller. Distinguishing them tells someone
     *         probing the endpoint which part of their forgery to fix.
     */
    public GoogleIdentity verify(String idTokenString) {
        if (!configured) {
            throw new InvalidGoogleTokenException();
        }
        GoogleIdToken token;
        try {
            token = verifier.verify(idTokenString);
        } catch (Exception e) {
            // A malformed token and an unreachable Google both land here. Logged
            // at debug because a stream of these is someone probing, not a fault.
            log.debug("Google ID token rejected: {}", e.toString());
            throw new InvalidGoogleTokenException();
        }
        if (token == null) {
            throw new InvalidGoogleTokenException();
        }

        GoogleIdToken.Payload payload = token.getPayload();
        if (!Boolean.TRUE.equals(payload.getEmailVerified())) {
            throw new InvalidGoogleTokenException();
        }

        Object name = payload.get("name");
        return new GoogleIdentity(
                payload.getSubject(),
                payload.getEmail(),
                name == null || name.toString().isBlank() ? payload.getEmail() : name.toString());
    }
}
