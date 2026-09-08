package com.eventbooking.ticket;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Refuses to start on the shipped placeholder signing secret.
 *
 * <p>{@link TicketTokenCodec} used to only <em>warn</em> about this. A warning
 * is the wrong instrument: it scrolls past on the one deploy that matters, and
 * the application comes up signing real tickets with a key that is published in
 * this repository — so anyone who can read the repo can mint a QR that opens a
 * gate. An unset key has to stop the application, not degrade it quietly.
 *
 * <p><b>Why a separate bean rather than a throw inside the codec.</b> The codec
 * is constructed directly by its tests ({@code new TicketTokenCodec(props)})
 * and by anything that wants to sign without a Spring context. Making it
 * profile-aware would drag an {@code Environment} into a pure function and give
 * every test a placeholder secret to work around. The guard is the deployment
 * concern; the codec stays the cryptography.
 *
 * <p>{@code @Profile("!dev")} rather than a check for some "prod" marker,
 * because it has to fail <em>closed</em>: a production deploy that forgets to
 * set its profile must break, not quietly become the insecure case. Local runs
 * opt in with {@code -Dspring-boot.run.profiles=dev}, and
 * {@code application-dev.yml} supplies a dev-only key.
 */
@Component
@Profile("!dev")
public class TicketSecretGuard {

    public TicketSecretGuard(TicketProperties properties) {
        if (TicketProperties.PLACEHOLDER_SECRET.equals(properties.signingSecret())) {
            throw new IllegalStateException("""
                    app.ticket.signing-secret is still the placeholder shipped in this \
                    repository, so anyone who can read the repo can forge a ticket that \
                    opens a gate.

                    Set TICKET_SIGNING_SECRET to at least %d random characters, or run \
                    with the dev profile (-Dspring-boot.run.profiles=dev) for local work.

                    Note that rotating this key invalidates every QR already in a \
                    customer's hand, so choose it once and keep it.\
                    """.formatted(TicketProperties.MIN_SECRET_LENGTH));
        }
    }
}
