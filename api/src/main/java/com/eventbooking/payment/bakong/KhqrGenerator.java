package com.eventbooking.payment.bakong;

import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.payment.PaymentProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Builds the KHQR string a customer scans, and the md5 the integration then
 * polls Bakong with.
 *
 * <p>KHQR is EMVCo: a flat list of {@code ID(2) + LENGTH(2) + VALUE} triples in
 * a fixed order, closed by a CRC over everything before it. Two details are
 * Bakong's rather than EMVCo's, and both matter here:
 *
 * <ul>
 *   <li><b>Tag 99</b> carries creation and expiry timestamps in epoch
 *       milliseconds. It is what makes each QR unique - without it two
 *       attempts on the same booking for the same amount would produce
 *       byte-identical payloads, hence the same md5, hence a collision on
 *       {@code uq_payment_txn_provider_ref}.</li>
 *   <li><b>The md5 of the whole payload</b> is the key
 *       {@code /v1/check_transaction_by_md5} is asked about. There is no
 *       separate transaction id to quote until the money has actually landed.</li>
 * </ul>
 *
 * <p>Written by hand rather than pulled from Bakong's SDK: the format is a
 * hundred lines, it is the piece most worth having a test over, and the SDK
 * would drag a transitive HTTP stack into a lane that already has one.
 */
@Component
public class KhqrGenerator {

    // ---- EMVCo tags, in the order Bakong emits them --------------------
    private static final String TAG_PAYLOAD_FORMAT = "00";
    private static final String TAG_POINT_OF_INITIATION = "01";
    private static final String TAG_INDIVIDUAL_ACCOUNT = "29";
    private static final String TAG_MERCHANT_ACCOUNT = "30";
    private static final String TAG_MERCHANT_CATEGORY = "52";
    private static final String TAG_CURRENCY = "53";
    private static final String TAG_AMOUNT = "54";
    private static final String TAG_COUNTRY = "58";
    private static final String TAG_MERCHANT_NAME = "59";
    private static final String TAG_MERCHANT_CITY = "60";
    private static final String TAG_ADDITIONAL_DATA = "62";
    private static final String TAG_TIMESTAMP = "99";
    private static final String TAG_CRC = "63";

    // ---- sub-tags -----------------------------------------------------
    private static final String SUB_ACCOUNT_ID = "00";
    private static final String SUB_MERCHANT_ID = "01";
    private static final String SUB_ACQUIRING_BANK = "02";
    private static final String SUB_BILL_NUMBER = "01";
    private static final String SUB_STORE_LABEL = "03";
    private static final String SUB_TERMINAL_LABEL = "07";
    private static final String SUB_TIMESTAMP_CREATED = "00";
    private static final String SUB_TIMESTAMP_EXPIRES = "01";

    private static final String PAYLOAD_FORMAT_VERSION = "01";
    /** 12 = dynamic: this QR carries an amount and is meant to be paid once. */
    private static final String DYNAMIC_QR = "12";
    private static final String COUNTRY_KH = "KH";

    /** EMVCo caps merchant name at 25 characters and city at 15. */
    private static final int MAX_MERCHANT_NAME = 25;
    private static final int MAX_MERCHANT_CITY = 15;
    private static final int MAX_BILL_NUMBER = 25;
    /** A TLV length field is two digits, so no single value may exceed this. */
    private static final int MAX_VALUE_LENGTH = 99;

    private final PaymentProperties.Bakong config;

    public KhqrGenerator(PaymentProperties properties) {
        this.config = properties.bakong();
        validateMerchantConfig();
    }

    /**
     * @param billNumber what the payer and the bank statement will show - the
     *                   booking reference, so a payment can be traced back
     *                   without the platform's internal ids
     * @param currency   which of the booking's two totals is being charged
     * @param minorUnits the amount in that currency's smallest unit: cents for
     *                   USD, whole riel for KHR (riel has no minor unit)
     */
    public Khqr generate(String billNumber, PaymentCurrency currency, long minorUnits,
                         Instant createdAt, Instant expiresAt) {
        if (minorUnits <= 0) {
            throw new IllegalArgumentException("KHQR amount must be positive, got " + minorUnits);
        }
        if (!expiresAt.isAfter(createdAt)) {
            throw new IllegalArgumentException("KHQR expiry must be after its creation");
        }

        StringBuilder qr = new StringBuilder();
        qr.append(tlv(TAG_PAYLOAD_FORMAT, PAYLOAD_FORMAT_VERSION));
        qr.append(tlv(TAG_POINT_OF_INITIATION, DYNAMIC_QR));
        qr.append(accountTemplate());
        qr.append(tlv(TAG_MERCHANT_CATEGORY, config.merchantCategoryCode()));
        qr.append(tlv(TAG_CURRENCY, currency.numericCode()));
        qr.append(tlv(TAG_AMOUNT, formatAmount(currency, minorUnits)));
        qr.append(tlv(TAG_COUNTRY, COUNTRY_KH));
        qr.append(tlv(TAG_MERCHANT_NAME, config.merchantName()));
        qr.append(tlv(TAG_MERCHANT_CITY, config.merchantCity()));
        qr.append(additionalData(billNumber));
        qr.append(timestamps(createdAt, expiresAt));

        // The CRC covers its own id and length ("6304") but not its value,
        // so those four characters go in before the checksum is taken.
        qr.append(TAG_CRC).append("04");
        qr.append(crc16(qr.toString()));

        String payload = qr.toString();
        return new Khqr(payload, md5(payload), expiresAt);
    }

    // ------------------------------------------------------------------
    // Templates
    // ------------------------------------------------------------------

    /**
     * Tag 29 or 30 depending on the kind of Bakong account behind the QR.
     * A merchant account must additionally declare its merchant id and
     * acquiring bank; an individual account carries the account id alone.
     */
    private String accountTemplate() {
        if (config.accountType() == PaymentProperties.BakongAccountType.MERCHANT) {
            String value = tlv(SUB_ACCOUNT_ID, config.accountId())
                    + tlv(SUB_MERCHANT_ID, config.merchantId())
                    + tlv(SUB_ACQUIRING_BANK, config.acquiringBank());
            return tlv(TAG_MERCHANT_ACCOUNT, value);
        }
        return tlv(TAG_INDIVIDUAL_ACCOUNT, tlv(SUB_ACCOUNT_ID, config.accountId()));
    }

    private String additionalData(String billNumber) {
        String value = tlv(SUB_BILL_NUMBER, truncate(billNumber, MAX_BILL_NUMBER))
                + tlv(SUB_STORE_LABEL, truncate(config.storeLabel(), MAX_VALUE_LENGTH))
                + tlv(SUB_TERMINAL_LABEL, truncate(config.terminalLabel(), MAX_VALUE_LENGTH));
        return tlv(TAG_ADDITIONAL_DATA, value);
    }

    /**
     * Bakong's own extension. The expiry here is advisory - a bank app refuses
     * a lapsed QR, but nothing stops a customer scanning one that has already
     * been reclaimed on our side, which is why payment_transaction.expires_at
     * is the value the reconciler actually trusts.
     */
    private String timestamps(Instant createdAt, Instant expiresAt) {
        String value = tlv(SUB_TIMESTAMP_CREATED, Long.toString(createdAt.toEpochMilli()))
                + tlv(SUB_TIMESTAMP_EXPIRES, Long.toString(expiresAt.toEpochMilli()));
        return tlv(TAG_TIMESTAMP, value);
    }

    // ------------------------------------------------------------------
    // Primitives
    // ------------------------------------------------------------------

    /** One EMVCo triple: two-digit id, two-digit length, value. */
    static String tlv(String id, String value) {
        if (value.length() > MAX_VALUE_LENGTH) {
            throw new IllegalArgumentException(
                    "KHQR field " + id + " is " + value.length() + " chars; the length prefix holds two digits.");
        }
        return id + String.format("%02d", value.length()) + value;
    }

    /**
     * KHR is a zero-decimal currency, so 20000 riel is "20000" and never
     * "20000.00" - a bank app reads the trailing pair as centimes and refuses
     * the QR. USD keeps its two places.
     */
    static String formatAmount(PaymentCurrency currency, long minorUnits) {
        return BigDecimal.valueOf(minorUnits)
                .movePointLeft(currency.minorUnits())
                .setScale(currency.minorUnits())
                .toPlainString();
    }

    /**
     * CRC-16/CCITT-FALSE: polynomial 0x1021, seed 0xFFFF, no reflection, no
     * final xor, rendered as four uppercase hex digits. EMVCo picked this one
     * specifically; the other CRC-16 variants produce a checksum every bank app
     * rejects.
     */
    static String crc16(String data) {
        int crc = 0xFFFF;
        for (byte b : data.getBytes(StandardCharsets.UTF_8)) {
            crc ^= (b & 0xFF) << 8;
            for (int bit = 0; bit < 8; bit++) {
                crc = ((crc & 0x8000) != 0) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                crc &= 0xFFFF;
            }
        }
        return String.format("%04X", crc);
    }

    /** Lowercase hex md5 of the payload - what Bakong calls the transaction's md5. */
    static String md5(String payload) {
        try {
            byte[] digest = MessageDigest.getInstance("MD5").digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // MD5 is required of every JRE; if it is missing the platform is broken.
            throw new IllegalStateException("MD5 is unavailable on this JVM", e);
        }
    }

    private static String truncate(String value, int max) {
        String safe = value == null ? "" : value;
        return safe.length() <= max ? safe : safe.substring(0, max);
    }

    /**
     * Fails at startup rather than at the first customer's checkout: a merchant
     * name one character too long produces a QR that every bank app rejects,
     * and that is a miserable thing to discover from a support ticket.
     */
    private void validateMerchantConfig() {
        if (isBlank(config.accountId())) {
            throw new IllegalStateException("app.payment.bakong.account-id must be set (e.g. BAKONG_ACCOUNT_ID).");
        }
        if (config.merchantName().length() > MAX_MERCHANT_NAME) {
            throw new IllegalStateException(
                    "app.payment.bakong.merchant-name must be at most " + MAX_MERCHANT_NAME + " characters.");
        }
        if (config.merchantCity().length() > MAX_MERCHANT_CITY) {
            throw new IllegalStateException(
                    "app.payment.bakong.merchant-city must be at most " + MAX_MERCHANT_CITY + " characters.");
        }
        if (config.accountType() == PaymentProperties.BakongAccountType.MERCHANT
                && (isBlank(config.merchantId()) || isBlank(config.acquiringBank()))) {
            throw new IllegalStateException(
                    "A MERCHANT Bakong account needs app.payment.bakong.merchant-id and .acquiring-bank.");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * A generated QR and the two things the rest of the lane needs from it.
     *
     * @param payload   the string to render as a QR image (the web draws it;
     *                  the API never produces a bitmap)
     * @param md5       poll key for /v1/check_transaction_by_md5, stored as
     *                  payment_transaction.provider_ref
     * @param expiresAt when this QR stops being scannable
     */
    public record Khqr(String payload, String md5, Instant expiresAt) {
    }
}
