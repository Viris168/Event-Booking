package com.eventbooking.payment.AbaPayway;

import com.eventbooking.common.error.PaymentGatewayException;
import com.eventbooking.model.ABA.BankPaymentRequest;
import com.eventbooking.model.ABA.BankPaymentResponse;
import com.eventbooking.model.ABA.BankStatusResponse;
import com.eventbooking.model.ABA.PaywayCheckoutForm;
import com.eventbooking.model.Booking;
import com.eventbooking.service.ABAPay.PayWayHashUtil;
import com.eventbooking.service.ABAPay.PaywayProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import java.util.Base64;
import java.nio.charset.StandardCharsets;

@Component
public class AbaPaywayGateway {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    /** Form values shared by the hash and the checkout form (developer.payway.com.kh). */
    private static final String PAYMENT_OPTION = "abapay_khqr";
    private static final String CURRENCY = "USD";
    private static final String TYPE = "purchase";
    /** PayWay's own modal on desktop / bottom sheet on phones, the way the plugin opens it. */
    private static final String VIEW_TYPE = "popup";

    private final String merchantId;
    private final String apiKey;
    private final String paywayBaseUrl;
    private final OkHttpClient client;
    private final ObjectMapper objectMapper;

    public AbaPaywayGateway(PaywayProperties payway) {
        this.merchantId = payway.getMerchantId();
        this.apiKey = payway.getApiKey();
        this.paywayBaseUrl = payway.getBaseUrl();
        this.client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .followRedirects(false).build();
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    /**
     * Builds the signed purchase form whose submission opens PayWay's hosted
     * checkout - the same arrangement the official plugin uses. The browser
     * posts the fields to {@code action} itself; PayWay answers with its
     * checkout page, which its plugin script (checkout2-0.js) renders as a
     * modal / bottom sheet with the QR drawn by ABA on that page.
     *
     * <p>Nothing is created at PayWay until the customer actually opens the
     * form. check-transaction answering "not found" for an unopened attempt is
     * therefore the expected state, not an error.
     *
     * <p>Only fields covered by {@link PayWayHashUtil#computeHash} may appear
     * in the form - PayWay re-verifies the signature over everything it reads
     * back - so the two field lists must stay in lockstep.
     */
    public PaywayCheckoutForm createCheckoutForm(Booking booking, String tranId) {
        String reqTime = requestTime();
        String amount = String.format(Locale.US, "%.2f", booking.getTotalUsdCents() / 100.0);

        String buyerName = booking.getBuyerName();
        String firstName = (buyerName != null && buyerName.matches("^[\\x00-\\x7F]+$")) ? buyerName : "Event-Booking";

        BankPaymentRequest payment = new BankPaymentRequest();
        payment.setReqTime(reqTime);
        payment.setMerchantid(merchantId);
        payment.setTranid(tranId);
        payment.setAmount(Double.parseDouble(amount));
        payment.setFirstname(firstName);
        payment.setLastname("");
        payment.setEmail(booking.getBuyerEmail());
        payment.setPhone(booking.getBuyerPhoneE164());
        payment.setType(TYPE);
        payment.setPaymentOption(PAYMENT_OPTION);
        payment.setCurrency(CURRENCY);
        payment.setViewType(VIEW_TYPE);
        // 0 = use the Checkout service, which redirects the browser to the
        // hosted checkout page. A merchant profile that also supports the QR
        // Payment API would otherwise answer this request with JSON, which has
        // nothing to render in the checkout iframe. Not part of the hash.
        payment.setPaymentGate(0L);
        payment.setHash(PayWayHashUtil.computeHash(payment, apiKey));

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("req_time", reqTime);
        fields.put("merchant_id", merchantId);
        fields.put("tran_id", tranId);
        fields.put("amount", amount);
        fields.put("firstname", value(firstName));
        fields.put("lastname", "");
        fields.put("email", value(booking.getBuyerEmail()));
        fields.put("phone", value(booking.getBuyerPhoneE164()));
        fields.put("type", TYPE);
        fields.put("payment_option", PAYMENT_OPTION);
        fields.put("currency", CURRENCY);
        fields.put("view_type", VIEW_TYPE);
        fields.put("payment_gate", "0");
        fields.put("hash", payment.getHash());

        return new PaywayCheckoutForm(
                paywayBaseUrl + "/api/payment-gateway/v1/payments/purchase", fields);
    }
    
    public String createQrPayload(Booking booking, String tranId) {
        PaywayCheckoutForm form = createCheckoutForm(booking, tranId);
        
        okhttp3.FormBody.Builder formBuilder = new okhttp3.FormBody.Builder();
        for (Map.Entry<String, String> entry : form.getFields().entrySet()) {
            formBuilder.add(entry.getKey(), entry.getValue());
        }
        
        Request request = new Request.Builder()
                .url(form.getAction())
                .post(formBuilder.build())
                .build();
                
        try (Response response = client.newCall(request).execute()) {
            String location = response.header("Location");
            if (location != null && location.contains("/checkout/")) {
                String base64 = location.substring(location.lastIndexOf('/') + 1);
                base64 = java.net.URLDecoder.decode(base64, StandardCharsets.UTF_8.name());
                String json = new String(Base64.getDecoder().decode(base64), StandardCharsets.UTF_8);
                com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(json);
                com.fasterxml.jackson.databind.JsonNode downloadQrNode = root.get("download_qr");

                if (downloadQrNode != null && !downloadQrNode.isNull()) {
                    return downloadQrNode.asText();
                }
                
                throw new PaymentGatewayException("download_qr not found in PayWay redirect JSON: " + json);
            }
            throw new PaymentGatewayException("Unexpected PayWay redirect location: " + location);
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay purchase API", e);
        }
    }

    public BankStatusResponse checkStatus(String tranId) {
        String reqTime = requestTime();
        String hash = PayWayHashUtil.computeCheckTransactionHash(reqTime, merchantId, tranId, apiKey);
        String payload = String.format(Locale.US,
                "{\"req_time\":\"%s\",\"merchant_id\":\"%s\",\"tran_id\":\"%s\",\"hash\":\"%s\"}",
                reqTime, merchantId, tranId, hash);
        Request request = new Request.Builder()
                .url(paywayBaseUrl + "/api/payment-gateway/v1/payments/check-transaction-2")
                .post(RequestBody.create(payload, JSON)).build();
        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null)
                throw new PaymentGatewayException("PayWay returned an empty response");
            return objectMapper.readValue(response.body().string(), BankStatusResponse.class);
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay status API", e);
        }
    }
    
    public BankPaymentResponse closeTransaction(String tranId) {
        String reqTime = requestTime();
        String hash = PayWayHashUtil.computeCheckTransactionHash(reqTime, merchantId, tranId, apiKey);
        try {
            String payload = objectMapper.writeValueAsString(Map.of(
                    "req_time", reqTime,
                    "merchant_id", merchantId,
                    "tran_id", tranId,
                    "hash", hash));
            Request request = new Request.Builder()
                    .url(paywayBaseUrl + "/api/payment-gateway/v1/payments/close-transaction")
                    .post(RequestBody.create(payload, JSON))
                    .build();
            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful() || response.body() == null) {
                    throw new PaymentGatewayException(
                            "PayWay close-transaction request failed with HTTP " + response.code());
                }
                return objectMapper.readValue(response.body().string(), BankPaymentResponse.class);
            }
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay close-transaction API", e);
        }
    }

    /**
     * PayWay timestamps are UTC (yyyyMMddHHmmss). The hash is signed over this
     * string, so a local-timezone stamp is rejected as a bad signature.
     */
    private static String requestTime() {
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmmss");
        dateFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
        return dateFormat.format(new Date());
    }

    private static String value(Object value) {
        return value == null ? "" : value.toString();
    }

}
