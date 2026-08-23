package com.eventbooking.service.ABAPay;

import com.eventbooking.common.error.PaymentGatewayException;
import com.eventbooking.model.ABA.BankPaymentRequest;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.math.BigDecimal;

public class PayWayHashUtil {

    private PayWayHashUtil() {
    }

    /** Creates PayWay's Base64 encoded HMAC-SHA512 signature. */
    public static String computeHash(BankPaymentRequest payment, String apiKey) {
        String payload = value(payment.getReqTime())
                + value(payment.getMerchantid())
                + value(payment.getTranid())
                + String.format(java.util.Locale.US, "%.2f", payment.getAmount())
                + value(payment.getItems())
                + value(payment.getShipping())
                + value(payment.getFirstname())
                + value(payment.getLastname())
                + value(payment.getEmail())
                + value(payment.getPhone())
                + value(payment.getType())
                + value(payment.getPaymentOption())
                + value(payment.getReturnurl())
                + value(payment.getCancelurl())
                + value(payment.getContinueSuccessurl())
                + value(payment.getReturnDeeplink())
                + value(payment.getCurrency())
                + value(payment.getCustomFields())
                + value(payment.getReturnParams())
                + value(payment.getPayout())
                + value(payment.getLifetime())
                + value(payment.getAdditionalParams())
                + value(payment.getGooglePayToken())
                + value(payment.getSkipSuccessPage());

        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(apiKey.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return Base64.getEncoder().encodeToString(
                    mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new PaymentGatewayException("Unable to generate the PayWay request hash", e);
        }
    }

    /** Creates PayWay's Base64 encoded HMAC-SHA512 signature for checking transaction status. */
    public static String computeCheckTransactionHash(String reqTime, String merchantId, String tranId, String apiKey) {
        String payload = value(reqTime) + value(merchantId) + value(tranId);
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(apiKey.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return Base64.getEncoder().encodeToString(
                    mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new PaymentGatewayException("Unable to generate the PayWay check-transaction hash", e);
        }
    }

    private static String value(Object value) {
        return value == null ? "" : value.toString();
    }

    public static String computeCheckTransactionHashs(String reqTime, String merchantId, String apiKey) {
        String payload = value(reqTime) + value(merchantId) ;
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(apiKey.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return Base64.getEncoder().encodeToString(
                    mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new PaymentGatewayException("Unable to generate the PayWay check-transaction hash", e);
        }
    }
}
