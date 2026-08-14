package com.eventbooking.payment.bakong;

import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.payment.PaymentProperties;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The QR format, tested without a database or a provider.
 *
 * <p>Worth being thorough about: a malformed KHQR does not fail loudly, it just
 * makes every banking app in Cambodia refuse the code, and the only symptom is
 * a customer saying "it does not work". The checks below are structural - the
 * payload is parsed back apart rather than compared to a golden string, so they
 * describe the format instead of freezing one example of it.
 */
class KhqrGeneratorTest {

    private static final Instant CREATED = Instant.parse("2026-08-14T09:00:00Z");
    private static final Instant EXPIRES = CREATED.plus(Duration.ofMinutes(5));

    // ------------------------------------------------------------------
    // The checksum
    // ------------------------------------------------------------------

    @Test
    void crcMatchesThePublishedCheckValueForCcittFalse() {
        // "123456789" -> 0x29B1 is the standard check value for
        // CRC-16/CCITT-FALSE. The neighbouring CRC-16 variants (ARC, XMODEM,
        // KERMIT) all produce something else for this input, so this one
        // assertion pins down that the right variant is implemented - and that
        // is the difference between a QR that scans and one that does not.
        assertThat(KhqrGenerator.crc16("123456789")).isEqualTo("29B1");
    }

    @Test
    void closesThePayloadWithACrcOverEverythingBeforeIt() {
        String payload = generator().generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload();

        assertThat(payload).matches(".*6304[0-9A-F]{4}$");

        // The CRC covers its own tag and length ("6304") but not its value.
        String withoutChecksum = payload.substring(0, payload.length() - 4);
        String checksum = payload.substring(payload.length() - 4);
        assertThat(KhqrGenerator.crc16(withoutChecksum)).isEqualTo(checksum);
    }

    // ------------------------------------------------------------------
    // Structure
    // ------------------------------------------------------------------

    @Test
    void emitsTheMandatoryEmvcoHeader() {
        String payload = generator().generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload();
        Map<String, String> tags = parse(payload);

        assertThat(payload).startsWith("000201");
        assertThat(tags.get("00")).isEqualTo("01");
        // 12 = dynamic. A static QR (11) carries no amount, and the payer would
        // be asked to type one in - which is how a customer underpays.
        assertThat(tags.get("01")).isEqualTo("12");
        assertThat(tags.get("58")).isEqualTo("KH");
        assertThat(tags.get("53")).isEqualTo("116");
    }

    @Test
    void carriesTheBookingReferenceSoAPaymentCanBeTracedBack() {
        String payload = generator().generate("KH-7QF2M8ZP", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload();

        Map<String, String> additional = parse(parse(payload).get("62"));
        assertThat(additional.get("01")).isEqualTo("KH-7QF2M8ZP");
    }

    @Test
    void stampsBakongsCreationAndExpiryTimestamps() {
        String payload = generator().generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload();

        Map<String, String> timestamps = parse(parse(payload).get("99"));
        assertThat(timestamps.get("00")).isEqualTo(String.valueOf(CREATED.toEpochMilli()));
        assertThat(timestamps.get("01")).isEqualTo(String.valueOf(EXPIRES.toEpochMilli()));
    }

    @Test
    void usesTag29ForAnIndividualAccount() {
        String payload = generator().generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload();
        Map<String, String> tags = parse(payload);

        assertThat(tags).containsKey("29").doesNotContainKey("30");
        assertThat(parse(tags.get("29")).get("00")).isEqualTo("event_booking@dev");
    }

    @Test
    void usesTag30WithMerchantDetailsForAMerchantAccount() {
        KhqrGenerator merchant = new KhqrGenerator(properties(bakong()
                .accountType(PaymentProperties.BakongAccountType.MERCHANT)
                .merchantId("MERCH-001")
                .acquiringBank("wing")));

        Map<String, String> tags = parse(
                merchant.generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload());

        assertThat(tags).containsKey("30").doesNotContainKey("29");
        Map<String, String> account = parse(tags.get("30"));
        assertThat(account.get("00")).isEqualTo("event_booking@dev");
        assertThat(account.get("01")).isEqualTo("MERCH-001");
        assertThat(account.get("02")).isEqualTo("wing");
    }

    // ------------------------------------------------------------------
    // Amounts
    // ------------------------------------------------------------------

    @Test
    void writesRielAsAWholeNumber() {
        // KHR has no minor unit. "102500.00" would be read as centimes and the
        // QR refused, so the trailing pair must not appear.
        String payload = generator().generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES).payload();

        assertThat(parse(payload).get("54")).isEqualTo("102500");
    }

    @Test
    void writesDollarsWithTwoDecimals() {
        KhqrGenerator usd = new KhqrGenerator(properties(bakong().currency(PaymentCurrency.USD)));

        // 2500 cents, and the currency code switches with it.
        String payload = usd.generate("KH-TEST01", PaymentCurrency.USD, 2_500, CREATED, EXPIRES).payload();

        assertThat(parse(payload).get("54")).isEqualTo("25.00");
        assertThat(parse(payload).get("53")).isEqualTo("840");
    }

    @Test
    void refusesAnAmountOfZeroOrLess() {
        assertThatThrownBy(() -> generator().generate("KH-TEST01", PaymentCurrency.KHR, 0, CREATED, EXPIRES))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive");
    }

    @Test
    void refusesAnExpiryThatIsNotInTheFuture() {
        assertThatThrownBy(() -> generator().generate("KH-TEST01", PaymentCurrency.KHR, 100, CREATED, CREATED))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ------------------------------------------------------------------
    // The md5 the reconciler polls with
    // ------------------------------------------------------------------

    @Test
    void md5IsTheDigestOfTheWholePayload() throws NoSuchAlgorithmException {
        KhqrGenerator.Khqr qr = generator().generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES);

        byte[] expected = MessageDigest.getInstance("MD5")
                .digest(qr.payload().getBytes(StandardCharsets.UTF_8));
        assertThat(qr.md5()).isEqualTo(HexFormat.of().formatHex(expected));
    }

    @Test
    void twoAttemptsOnTheSameBookingProduceDifferentQrs() {
        // Same booking, same amount, one second apart. If the timestamp tag were
        // dropped these would be byte-identical, both attempts would share an
        // md5, and the second would collide on uq_payment_txn_provider_ref -
        // meaning a customer could never retry a payment.
        KhqrGenerator generator = generator();
        KhqrGenerator.Khqr first = generator.generate("KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED, EXPIRES);
        KhqrGenerator.Khqr second = generator.generate(
                "KH-TEST01", PaymentCurrency.KHR, 102_500, CREATED.plusSeconds(1), EXPIRES.plusSeconds(1));

        assertThat(second.payload()).isNotEqualTo(first.payload());
        assertThat(second.md5()).isNotEqualTo(first.md5());
    }

    // ------------------------------------------------------------------
    // Configuration is checked at startup, not at the first customer
    // ------------------------------------------------------------------

    @Test
    void refusesToStartWithAMerchantNameEmvcoCannotCarry() {
        assertThatThrownBy(() -> new KhqrGenerator(properties(bakong()
                .merchantName("An Extremely Long Merchant Name Indeed"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("merchant-name");
    }

    @Test
    void refusesToStartWithoutAnAccountId() {
        assertThatThrownBy(() -> new KhqrGenerator(properties(bakong().accountId("  "))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("account-id");
    }

    @Test
    void refusesAMerchantAccountMissingItsMerchantId() {
        assertThatThrownBy(() -> new KhqrGenerator(properties(bakong()
                .accountType(PaymentProperties.BakongAccountType.MERCHANT))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("merchant-id");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Reads an EMVCo payload back into its tags, independently of the code that
     * wrote it - so a bug in the length prefixes shows up here as a parse
     * failure rather than being mirrored by the assertion.
     */
    private static Map<String, String> parse(String payload) {
        Map<String, String> tags = new HashMap<>();
        int cursor = 0;
        while (cursor + 4 <= payload.length()) {
            String id = payload.substring(cursor, cursor + 2);
            int length = Integer.parseInt(payload.substring(cursor + 2, cursor + 4));
            int valueStart = cursor + 4;
            int valueEnd = valueStart + length;
            if (valueEnd > payload.length()) {
                throw new IllegalStateException("Tag " + id + " claims " + length + " chars but the payload ends");
            }
            tags.put(id, payload.substring(valueStart, valueEnd));
            cursor = valueEnd;
        }
        if (cursor != payload.length()) {
            throw new IllegalStateException("Trailing bytes after the last tag - the payload is malformed");
        }
        return tags;
    }

    private static KhqrGenerator generator() {
        return new KhqrGenerator(properties(bakong()));
    }

    private static PaymentProperties properties(BakongBuilder builder) {
        return new PaymentProperties(builder.build(),
                new PaymentProperties.Poll(true, Duration.ofSeconds(5), 50,
                        Duration.ofSeconds(3), Duration.ofMinutes(1)));
    }

    private static BakongBuilder bakong() {
        return new BakongBuilder();
    }

    /** Keeps the sixteen-field config record out of every test body. */
    private static final class BakongBuilder {
        private PaymentProperties.BakongAccountType accountType = PaymentProperties.BakongAccountType.INDIVIDUAL;
        private String accountId = "event_booking@dev";
        private String merchantId;
        private String acquiringBank;
        private String merchantName = "Event Booking KH";
        private PaymentCurrency currency = PaymentCurrency.KHR;

        BakongBuilder accountType(PaymentProperties.BakongAccountType value) {
            this.accountType = value;
            return this;
        }

        BakongBuilder accountId(String value) {
            this.accountId = value;
            return this;
        }

        BakongBuilder merchantId(String value) {
            this.merchantId = value;
            return this;
        }

        BakongBuilder acquiringBank(String value) {
            this.acquiringBank = value;
            return this;
        }

        BakongBuilder merchantName(String value) {
            this.merchantName = value;
            return this;
        }

        BakongBuilder currency(PaymentCurrency value) {
            this.currency = value;
            return this;
        }

        PaymentProperties.Bakong build() {
            return new PaymentProperties.Bakong(
                    PaymentProperties.BakongMode.MOCK,
                    "http://localhost",
                    "",
                    accountId,
                    accountType,
                    merchantId,
                    acquiringBank,
                    merchantName,
                    "Phnom Penh",
                    "5999",
                    "EventBooking",
                    "WEB",
                    currency,
                    Duration.ofMinutes(5),
                    Duration.ofSeconds(3),
                    Duration.ofSeconds(5));
        }
    }
}
