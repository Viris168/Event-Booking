package com.eventbooking.ticket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.UUID;

/**
 * Turns a ticket into the string its QR encodes, and back again.
 *
 * <p>The payload looks like {@code EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ}:
 * a version tag, the ticket id, the ticket's random token, and an HMAC over the
 * three. Roughly 60 characters, which keeps the QR at a low version and so
 * readable by a cheap scanner in bad light.
 *
 * <p><b>Why both a random token and a signature</b>, when either alone sounds
 * sufficient:
 *
 * <ul>
 *   <li>The <b>token</b> is 122 bits of randomness held in the database. It is
 *       what makes a ticket unguessable - knowing ticket 41 tells an attacker
 *       nothing about ticket 42 - and it is the authority, because a scan is
 *       only honoured when the presented token matches the stored one.</li>
 *   <li>The <b>signature</b> lets the gate reject a garbage or tampered code
 *       without touching the database, and stops ticket ids being enumerated by
 *       feeding the scanner an incrementing counter. It is a cheap filter in
 *       front of the real check, not a replacement for it.</li>
 * </ul>
 *
 * <p>The consequence is worth stating plainly: a leaked signing key on its own
 * does <em>not</em> let anyone mint a working ticket, because they would still
 * have to guess a token that only the database holds. Rotating the key
 * invalidates every QR already in a customer's hand, so it is a real operation
 * rather than a free one.
 *
 * <p>Both comparisons here are constant-time. A byte-by-byte compare that
 * returns early leaks, through timing, how much of a guess was correct - which
 * turns an impossible search into a feasible one.
 */
@Component
public class TicketTokenCodec {

    private static final Logger log = LoggerFactory.getLogger(TicketTokenCodec.class);

    /** Version prefix. A future format change becomes EBT2 and both can be read. */
    static final String VERSION = "EBT1";
    private static final String SEPARATOR = ".";
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    /**
     * 16 bytes of the 32-byte HMAC. Truncation is explicitly sanctioned for
     * HMAC, and 128 bits is far past what a gate could ever be brute-forced
     * through; the 16 characters saved keep the QR smaller.
     */
    private static final int SIGNATURE_BYTES = 16;

    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private final byte[] secret;

    public TicketTokenCodec(TicketProperties properties) {
        this.secret = properties.signingSecret().getBytes(StandardCharsets.UTF_8);

        if (properties.signingSecret().length() < TicketProperties.MIN_SECRET_LENGTH) {
            throw new IllegalStateException(
                    "app.ticket.signing-secret (TICKET_SIGNING_SECRET) must be at least "
                            + TicketProperties.MIN_SECRET_LENGTH + " characters.");
        }
        if (TicketProperties.PLACEHOLDER_SECRET.equals(properties.signingSecret())) {
            log.warn("app.ticket.signing-secret is still the shipped placeholder. Anyone with this "
                    + "repository can forge ticket signatures - set TICKET_SIGNING_SECRET before "
                    + "any real event.");
        }
    }

    /** The string to render as a QR. */
    public String encode(Long ticketId, UUID qrToken) {
        String body = VERSION + SEPARATOR + ticketId + SEPARATOR + encodeToken(qrToken);
        return body + SEPARATOR + ENCODER.encodeToString(sign(body));
    }

    /**
     * Parses and authenticates a scanned string.
     *
     * <p>Never throws on bad input: a gate scanner will read shopping barcodes,
     * boarding passes and smudged photocopies, and each of those is an ordinary
     * "no" rather than an exceptional condition.
     */
    public Decoded decode(String payload) {
        if (payload == null || payload.isBlank()) {
            return Decoded.malformed();
        }

        String[] parts = payload.trim().split("\\.");
        if (parts.length != 4 || !VERSION.equals(parts[0])) {
            return Decoded.malformed();
        }

        long ticketId;
        UUID token;
        byte[] presentedSignature;
        try {
            ticketId = Long.parseLong(parts[1]);
            token = decodeToken(parts[2]);
            presentedSignature = DECODER.decode(parts[3]);
        } catch (IllegalArgumentException e) {
            return Decoded.malformed();
        }

        String body = parts[0] + SEPARATOR + parts[1] + SEPARATOR + parts[2];
        if (!MessageDigest.isEqual(sign(body), presentedSignature)) {
            return Decoded.badSignature();
        }

        return Decoded.valid(ticketId, token);
    }

    /**
     * Constant-time comparison of a presented token against the stored one.
     * Lives here so every comparison of ticket secrets goes through the same
     * (timing-safe) door.
     */
    public boolean tokenMatches(UUID presented, UUID stored) {
        if (presented == null || stored == null) {
            return false;
        }
        return MessageDigest.isEqual(toBytes(presented), toBytes(stored));
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private byte[] sign(String body) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
            byte[] full = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));

            byte[] truncated = new byte[SIGNATURE_BYTES];
            System.arraycopy(full, 0, truncated, 0, SIGNATURE_BYTES);
            return truncated;
        } catch (NoSuchAlgorithmException | java.security.InvalidKeyException e) {
            // HmacSHA256 is required of every JRE; a failure here is a broken platform.
            throw new IllegalStateException("Cannot sign ticket tokens", e);
        }
    }

    private static String encodeToken(UUID token) {
        return ENCODER.encodeToString(toBytes(token));
    }

    private static UUID decodeToken(String encoded) {
        byte[] bytes = DECODER.decode(encoded);
        if (bytes.length != 16) {
            throw new IllegalArgumentException("A UUID is 16 bytes, got " + bytes.length);
        }
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }

    private static byte[] toBytes(UUID uuid) {
        return ByteBuffer.allocate(16)
                .putLong(uuid.getMostSignificantBits())
                .putLong(uuid.getLeastSignificantBits())
                .array();
    }

    /**
     * The result of reading a scanned string.
     *
     * @param outcome  why it failed, or OK
     * @param ticketId present only when OK
     * @param qrToken  present only when OK - still has to be checked against
     *                 the database, which is what actually authorises entry
     */
    public record Decoded(Outcome outcome, Long ticketId, UUID qrToken) {

        public enum Outcome {
            /** Well-formed and correctly signed. */
            OK,
            /** Not one of ours: wrong shape, wrong version, undecodable. */
            MALFORMED,
            /** Our shape, but the HMAC does not match - tampered or forged. */
            BAD_SIGNATURE
        }

        static Decoded valid(Long ticketId, UUID qrToken) {
            return new Decoded(Outcome.OK, ticketId, qrToken);
        }

        static Decoded malformed() {
            return new Decoded(Outcome.MALFORMED, null, null);
        }

        static Decoded badSignature() {
            return new Decoded(Outcome.BAD_SIGNATURE, null, null);
        }

        public boolean isOk() {
            return outcome == Outcome.OK;
        }
    }
}
