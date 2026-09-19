package com.eventbooking.dto.contact;

import java.time.Instant;

/**
 * What the sender gets back, and all they get back.
 *
 * <p>A separate, much smaller record than {@link ContactMessageResponse}, which
 * is deliberate. The submit endpoint is public, so whatever it returns is
 * readable by anyone who can POST - and echoing the stored row back would make
 * the form a way to confirm what the server retained, including fields the
 * service normalised or dropped.
 *
 * <p>What a sender actually needs is proof it arrived and something to quote if
 * they have to chase it. That is these two fields.
 *
 * <p>The id is not a secret and is not treated as one: it is sequential, so it
 * discloses roughly how many messages the platform has received. That is
 * acceptable - it is also the number an admin asks for on the phone - but it is
 * the reason nothing anywhere accepts this id from an untrusted caller as a way
 * to READ a message back.
 */
public record ContactMessageReceipt(

        /** The reference to quote when chasing this message. */
        Long id,

        /** Server time, so the sender and the inbox agree on when it landed. */
        Instant receivedAt
) {
}
