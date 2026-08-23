package com.eventbooking.service.ABAPay.impl;


import com.eventbooking.common.error.PaymentGatewayException;
import com.eventbooking.model.ABA.BankPaymentRequest;
import com.eventbooking.model.ABA.BankPaymentResponse;
import com.eventbooking.model.ABA.BankStatusResponse;
import com.eventbooking.repository.ABARepository;
import com.eventbooking.service.ABAPay.PayWayHashUtil;
import com.eventbooking.service.ABAPay.PaymentService;

import com.eventbooking.service.ABAPay.PaywayProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.Value;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/** Default implementation of the payment business operations. */
@Service
public class PaymentServiceimpl implements PaymentService {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final String PENDING = "PENDING";

    private final ABARepository paymentRepository;
    private final String merchantId;
    private final String apiKey;
    private final String paywayBaseUrl;
    private final OkHttpClient client;
    private final ObjectMapper objectMapper;


    public PaymentServiceimpl(ABARepository paymentRepository,
                              PaywayProperties payway) {
        this.paymentRepository = paymentRepository;
        this.merchantId = payway.getMerchantId();
        this.apiKey = payway.getApiKey();
        this.paywayBaseUrl = payway.getBaseUrl();
        this.client = new OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS).build();
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    @Override
    public BankPaymentResponse createQrPayment(Map<String, Object> requestPayload) {
        String reqTime = requestTime();
        String tranId = String.valueOf(System.currentTimeMillis());
        String firstname = valueOrDefault(requestPayload, "firstname", "sina");
        String lastname = valueOrDefault(requestPayload, "lastname", "chhum");
        String amount = amountOrDefault(requestPayload, "amount", "1.00");
        String currency = valueOrDefault(requestPayload, "currency", "USD");
        String phone = valueOrDefault(requestPayload, "phone", "093939399");
        String type = "purchase";
        String paymentOption = "abapay_khqr";

        BankPaymentRequest payment = new BankPaymentRequest();
        payment.setReqTime(reqTime);
        payment.setMerchantid(merchantId);
        payment.setTranid(tranId);
        payment.setAmount(Double.parseDouble(amount));
        payment.setFirstname(firstname);
        payment.setLastname(lastname);
        payment.setPhone(phone);
        payment.setCurrency(currency);
        payment.setPaymentOption(paymentOption);
        payment.setType(type);

        String hash = PayWayHashUtil.computeHash(payment, apiKey);
        RequestBody body = new MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("req_time", reqTime).addFormDataPart("merchant_id", merchantId)
                .addFormDataPart("tran_id", tranId).addFormDataPart("amount", amount)
                .addFormDataPart("firstname", firstname).addFormDataPart("lastname", lastname)
                .addFormDataPart("phone", phone).addFormDataPart("type", type)
                .addFormDataPart("payment_option", paymentOption).addFormDataPart("currency", currency)
                .addFormDataPart("hash", hash).build();
        Request request = new Request.Builder()
                .url(paywayBaseUrl + "/api/payment-gateway/v1/payments/purchase").post(body).build();

        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null) throw new PaymentGatewayException("PayWay returned an empty response");
            BankPaymentResponse payWayResponse = objectMapper.readValue(response.body().string(), BankPaymentResponse.class);
            if (payWayResponse.getStatus() != null && "00".equals(payWayResponse.getStatus().getCode())) {
                payment.setPaymentStatus(PENDING);
                paymentRepository.save(payment);
            }
            payWayResponse.setDisplayName(firstname + " " + lastname);
            payWayResponse.setDisplayAmount(amount);
            payWayResponse.setDisplayCurrency(currency);
            return payWayResponse;
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay payment API", e);
        }
    }

    @Override
    public Map<String, Object> closeTransaction(String tranId) {
        if (paymentRepository.findByTranidAndPaymentStatus(tranId, PENDING).isEmpty()) {
            return result(false, "Transaction is unknown, already paid, or already closed");
        }
        BankPaymentResponse response = close(tranId);

        boolean closed = response.getStatus() != null && "00".equals(response.getStatus().getCode());
        if (closed) closed = paymentRepository.updatePaymentStatusIfCurrent(tranId, PENDING, "CLOSED") == 1;
        String message = response.getStatus() == null ? "PayWay returned no status" : response.getStatus().getMessage();
        return result(closed, message);
    }

    @Override
    public Map<String, Object> checkTransactionStatus(String tranId) {
        if (paymentRepository.findByTranidAndPaymentStatus(tranId, PENDING).isEmpty()) {
            return result(false, "Unknown or already used transaction", "paid");
        }
        String reqTime = requestTime();
        String hash = PayWayHashUtil.computeCheckTransactionHash(reqTime, merchantId, tranId, apiKey);
        String payload = String.format(Locale.US,
                "{\"req_time\":\"%s\",\"merchant_id\":\"%s\",\"tran_id\":\"%s\",\"hash\":\"%s\"}",
                reqTime, merchantId, tranId, hash);
        Request request = new Request.Builder()
                .url(paywayBaseUrl + "/api/payment-gateway/v1/payments/check-transaction-2")
                .post(RequestBody.create(payload, JSON)).build();
        try (Response response = client.newCall(request).execute()) {
            if (response.body() == null) throw new PaymentGatewayException("PayWay returned an empty response");
            BankStatusResponse paywayResponse = objectMapper.readValue(response.body().string(), BankStatusResponse.class);
            boolean apiOk = paywayResponse.getStatus() != null && "00".equals(paywayResponse.getStatus().getCode());
            String providerStatus = paywayResponse.getData() == null
                    ? null
                    : paywayResponse.getData().getPaymentStatus();
            Long providerStatusCode = paywayResponse.getData() == null
                    ? null
                    : paywayResponse.getData().getPaymentStatusCode();

            // PayWay documents code 0 as the authoritative APPROVED state.
            // Some responses have varied in their text casing, so accept the
            // normalized text as a fallback while retaining the API success
            // envelope check.
            boolean approved = apiOk && paywayResponse.getData() != null
                    && (Long.valueOf(0L).equals(providerStatusCode)
                    || (providerStatus != null
                    && ("APPROVED".equalsIgnoreCase(providerStatus.trim())
                    || "PAID".equalsIgnoreCase(providerStatus.trim()))));
            if (approved) {
                paymentRepository.findByTranidAndPaymentStatus(tranId, PENDING).ifPresent(payment -> {
                    payment.setPaymentStatus("PAID");
                    paymentRepository.save(payment);
                });
                return result(true, "Payment confirmed by PayWay", "paid");
            }
            if (apiOk) {
                String status = providerStatus == null ? "UNKNOWN" : providerStatus;
                return result(false, status, "paid");
            }
            String message = paywayResponse.getStatus() == null ? "Unknown error" : paywayResponse.getStatus().getMessage();
            return result(false, message, "paid");
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay status API", e);
        }
    }

    @Override
    public Object getTransactionDetails(String tranId) {
        return getDetails(tranId);
    }

    @Override
    public Object getAllTransactions() {
        return getAll();
    }

    private static Map<String, Object> result(boolean value, String message) {
        return result(value, message, "closed");
    }

    private static Map<String, Object> result(boolean value, String message, String valueKey) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(valueKey, value);
        result.put("message", message == null ? "" : message);
        return result;
    }

    private static String valueOrDefault(Map<String, Object> payload, String key, String fallback) {
        Object value = payload == null ? null : payload.get(key);
        return value == null ? fallback : value.toString();
    }

    private static String amountOrDefault(Map<String, Object> payload, String key, String fallback) {
        Object value = payload == null ? null : payload.get(key);
        return value == null ? fallback : String.format(Locale.US, "%.2f", Double.parseDouble(value.toString()));
    }

    private static String requestTime() {
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyyMMddHHmmss");
        dateFormat.setTimeZone(TimeZone.getTimeZone("Asia/Phnom_Penh"));
        return dateFormat.format(new Date());
    }


    private BankPaymentResponse close(String tranId) {
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


    private Object getDetails(String tranId) {
        String reqTime = requestTime();
        String hash = PayWayHashUtil.computeCheckTransactionHash(reqTime, merchantId, tranId, apiKey);
        try {
            String payload = objectMapper.writeValueAsString(Map.of(
                    "req_time", reqTime,
                    "merchant_id", merchantId,
                    "tran_id", tranId,
                    "hash", hash));
            Request request = new Request.Builder()
                    .url(paywayBaseUrl + "/api/payment-gateway/v1/payments/transaction-detail")
                    .post(RequestBody.create(payload, JSON))
                    .build();

            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful() || response.body() == null) {
                    throw new PaymentGatewayException(
                            "PayWay failed with HTTP " + response.code());
                }
                return objectMapper.readValue(response.body().string(), Object.class);
            }
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay API", e);
        }
    }

    private Object getAll() {
        String reqTime = requestTime();
        String hash = PayWayHashUtil.computeCheckTransactionHashs(reqTime, merchantId, apiKey);
        try {
            String payload = objectMapper.writeValueAsString(Map.of(
                    "req_time", reqTime,
                    "merchant_id", merchantId,
                    "hash", hash));
            Request request = new Request.Builder()
                    .url(paywayBaseUrl + "/api/payment-gateway/v1/payments/transaction-list-2")
                    .post(RequestBody.create(payload, JSON))
                    .build();

            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful() || response.body() == null) {
                    throw new PaymentGatewayException(
                            "PayWay failed with HTTP " + response.code());
                }
                return objectMapper.readValue(response.body().string(), Object.class);
            }
        } catch (IOException e) {
            throw new PaymentGatewayException("Unable to call the PayWay API", e);
        }
    }
}
