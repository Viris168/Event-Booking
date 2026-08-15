package com.eventbooking.ticket;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * "Cannot be forged or guessed" is a security claim, so it gets tested as one:
 * every field of the payload is tampered with in turn, and each has to be
 * rejected.
 */
class TicketTokenCodecTest {

    private static final String SECRET = "test-secret-that-is-long-enough-to-pass-32";
    private static final UUID TOKEN = UUID.fromString("0116a81b-d5b0-4850-a0d4-8d9670762a2c");

    private final TicketTokenCodec codec = codecWith(SECRET);

    // ------------------------------------------------------------------
    // Round trip
    // ------------------------------------------------------------------

    @Test
    void readsBackWhatItWrote() {
        String payload = codec.encode(42L, TOKEN);

        TicketTokenCodec.Decoded decoded = codec.decode(payload);

        assertThat(decoded.isOk()).isTrue();
        assertThat(decoded.ticketId()).isEqualTo(42L);
        assertThat(decoded.qrToken()).isEqualTo(TOKEN);
    }

    @Test
    void staysShortEnoughToScanInBadLight() {
        // Every extra character pushes the QR to a denser version, and a denser
        // code is what fails on a cracked phone screen at a dark gate.
        String payload = codec.encode(999_999L, TOKEN);

        assertThat(payload).hasSizeLessThan(80);
        assertThat(payload).startsWith("EBT1.999999.");
        // URL-safe alphabet only: no '+', '/' or '=' to be mangled if a payload
        // ever travels in a query string or a filename.
        assertThat(payload).matches("[A-Za-z0-9._-]+");
    }

    @Test
    void givesEveryTicketAnUnrelatedCode() {
        // The whole guessing defence: ticket 43's code must reveal nothing about
        // ticket 42's, which holds because the token is random per ticket.
        String first = codec.encode(42L, UUID.randomUUID());
        String second = codec.encode(43L, UUID.randomUUID());

        assertThat(first).isNotEqualTo(second);
    }

    // ------------------------------------------------------------------
    // Tampering
    // ------------------------------------------------------------------

    @Test
    void rejectsAnEditedTicketId() {
        // The obvious attack: scan your own ticket, change the number, walk in
        // on somebody else's.
        String payload = codec.encode(42L, TOKEN);
        String[] parts = payload.split("\\.");
        String forged = parts[0] + ".43." + parts[2] + "." + parts[3];

        assertThat(codec.decode(forged).outcome())
                .isEqualTo(TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE);
    }

    @Test
    void rejectsASubstitutedToken() {
        String payload = codec.encode(42L, TOKEN);
        String[] parts = payload.split("\\.");
        String forged = parts[0] + "." + parts[1] + ".AAAAAAAAAAAAAAAAAAAAAA." + parts[3];

        assertThat(codec.decode(forged).outcome())
                .isEqualTo(TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE);
    }

    @Test
    void rejectsAnInventedSignature() {
        String payload = codec.encode(42L, TOKEN);
        String[] parts = payload.split("\\.");
        String forged = parts[0] + "." + parts[1] + "." + parts[2] + ".AAAAAAAAAAAAAAAAAAAAAA";

        assertThat(codec.decode(forged).outcome())
                .isEqualTo(TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE);
    }

    @Test
    void rejectsACodeSignedWithADifferentKey() {
        // Also the documented cost of rotating the secret: every ticket already
        // in a customer's hand stops validating.
        String fromElsewhere = codecWith("a-completely-different-secret-key-32-chars").encode(42L, TOKEN);

        assertThat(codec.decode(fromElsewhere).outcome())
                .isEqualTo(TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE);
    }

    // ------------------------------------------------------------------
    // Everything else a scanner sees
    // ------------------------------------------------------------------

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "   ",
            "hello",
            "EBT1.42",                         // truncated
            "EBT1.42.token.sig.extra",         // too many parts
            "EBT2.42.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA", // unknown version
            "EBT1.notanumber.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA",
            "EBT1.42.!!!not-base64!!!.AAAAAAAAAAAAAAAAAAAAAA",
            "EBT1.42.AAAA.AAAAAAAAAAAAAAAAAAAAAA",  // token is not 16 bytes
            "4901234567894",                   // a shop barcode
    })
    void treatsAnythingElseAsMalformedRatherThanThrowing(String scanned) {
        // A gate scanner reads whatever is put in front of it. None of this is
        // exceptional - it is Tuesday.
        assertThat(codec.decode(scanned).outcome())
                .isEqualTo(TicketTokenCodec.Decoded.Outcome.MALFORMED);
    }

    @Test
    void treatsNullAsMalformed() {
        assertThat(codec.decode(null).outcome())
                .isEqualTo(TicketTokenCodec.Decoded.Outcome.MALFORMED);
    }

    @Test
    void toleratesWhitespaceAroundAScan() {
        // Some scanners append a newline as an "enter" key.
        String payload = codec.encode(42L, TOKEN);

        assertThat(codec.decode("  " + payload + "\n").isOk()).isTrue();
    }

    // ------------------------------------------------------------------
    // Token comparison
    // ------------------------------------------------------------------

    @Test
    void comparesTokens() {
        assertThat(codec.tokenMatches(TOKEN, TOKEN)).isTrue();
        assertThat(codec.tokenMatches(TOKEN, UUID.randomUUID())).isFalse();
        assertThat(codec.tokenMatches(null, TOKEN)).isFalse();
        assertThat(codec.tokenMatches(TOKEN, null)).isFalse();
    }

    // ------------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------------

    @Test
    void refusesToStartWithAShortSecret() {
        assertThatThrownBy(() -> codecWith("too-short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("signing-secret");
    }

    private static TicketTokenCodec codecWith(String secret) {
        return new TicketTokenCodec(new TicketProperties(secret, 256, 4));
    }
}
