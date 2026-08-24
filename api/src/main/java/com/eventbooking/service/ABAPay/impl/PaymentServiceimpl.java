package com.eventbooking.service.ABAPay.impl;


import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.common.error.PaymentGatewayException;
import com.eventbooking.model.ABA.BankPaymentRequest;
import com.eventbooking.model.ABA.BankPaymentResponse;
import com.eventbooking.model.ABA.BankStatusResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.payment.PaywaySettlementService;
import com.eventbooking.repository.ABARepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.service.ABAPay.PayWayHashUtil;
import com.eventbooking.service.ABAPay.PaymentService;

import com.eventbooking.service.ABAPay.PaywayProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/** Default implementation of the payment business operations. */
@Service
public class PaymentServiceimpl implements PaymentService {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final String PENDING = "PENDING";
    private static final String PAID = "PAID";

    /**
     * States a booking can still be paid for. AWAITING_CONFIRMATION is absent on
     * purpose: an attempt is already in flight, and a second payable QR for one
     * booking means a second payment with nowhere to go.
     */
    private static final Set<BookingStatus> PAYABLE_STATES =
            EnumSet.of(BookingStatus.PENDING_PAYMENT, BookingStatus.PAYMENT_FAILED);

    private final ABARepository paymentRepository;
    private final BookingRepository bookingRepository;
    private final PaywaySettlementService settlementService;
    private final String merchantId;
    private final String apiKey;
    private final String paywayBaseUrl;
    private final OkHttpClient client;
    private final ObjectMapper objectMapper;


    public PaymentServiceimpl(ABARepository paymentRepository,
                              BookingRepository bookingRepository,
                              PaywaySettlementService settlementService,
                              PaywayProperties payway) {
        this.paymentRepository = paymentRepository;
        this.bookingRepository = bookingRepository;
        this.settlementService = settlementService;
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
        String currency = valueOrDefault(requestPayload, "currency", "USD");
        String phone = valueOrDefault(requestPayload, "phone", "093939399");
        String type = "purchase";
        String paymentOption = "abapay_khqr";

        // The booking this pays for. Absent when the endpoint is being used bare
        // to exercise the gateway, in which case there is nothing to confirm
        // later and check-transaction simply reports the money as received.
        Long bookingId = longOrNull(requestPayload, "booking_id", "bookingId");

        // Once a booking is named, its total is what gets charged - the payload's
        // own `amount` is ignored. A client that could name its own amount is a
        // client that can pay a cent for a fifty-dollar seat, and since an
        // approved transaction now confirms the booking and issues its tickets,
        // that would be a working underpayment. The booking snapshotted its
        // total at checkout precisely so it could be the authority here. This
        // mirrors the Bakong lane, whose StartPaymentRequest carries no amount
        // at all.
        String amount = bookingId == null
                ? amountOrDefault(requestPayload, "amount", "1.00")
                : bookingAmountUsd(bookingId);

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
        payment.setBookingId(bookingId);

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
        BankPaymentRequest local = paymentRepository.findById(tranId).orElse(null);
        if (local == null) {
            return result(false, "Unknown transaction", "paid");
        }

        // An already-settled transaction answers "paid" without calling PayWay.
        // The client polls this on a timer and keeps polling until it sees the
        // booking confirmed, so the second poll after settlement must not come
        // back "unknown or already used" and read as a failure.
        //
        // Read the state rather than re-settling: a client polls every few
        // seconds, and settling takes a row lock on the booking and re-runs
        // issuance. Only a booking that somehow is not CONFIRMED is worth
        // another attempt - that is the repair case, and it is rare.
        if (PAID.equals(local.getPaymentStatus())) {
            BookingStatus state = settlementService.stateOf(local.getBookingId());
            if (local.getBookingId() != null && state != BookingStatus.CONFIRMED) {
                state = settlementService.settle(local.getBookingId(), tranId);
            }
            return paidResult(local, state, "Payment already confirmed");
        }
        if (!PENDING.equals(local.getPaymentStatus())) {
            return result(false, "Transaction is " + local.getPaymentStatus(), "paid");
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
                // Confirm the booking and issue its tickets before the local row
                // is marked PAID. Done the other way round, a settlement that
                // threw would leave a transaction nothing would ever retry - the
                // customer paid and no ticket exists. This order means the worst
                // case is a repeated settle, which is idempotent.
                BookingStatus state = settlementService.settle(local.getBookingId(), tranId);

                local.setPaymentStatus(PAID);
                paymentRepository.save(local);

                return paidResult(local, state, "Payment confirmed by PayWay");
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

    /**
     * The approved answer, carrying what the pay screen needs to move on:
     * which booking to open, and whether it is confirmed yet. A client can act
     * on {@code bookingState} alone rather than guessing when to go looking for
     * tickets.
     */
    private static Map<String, Object> paidResult(BankPaymentRequest payment, BookingStatus state, String message) {
        Map<String, Object> result = result(true, message, "paid");
        result.put("bookingId", payment.getBookingId());
        result.put("bookingState", state == null ? null : state.name());
        return result;
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

    /**
     * What the named booking actually owes, as PayWay's decimal string.
     *
     * <p>Refuses rather than falling back to the client's figure: a booking that
     * cannot be found or cannot take money is a request that should not become a
     * payable QR at all. Silently charging the payload's amount instead is how
     * an underpayment gets through.
     */
    private String bookingAmountUsd(Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new IllegalArgumentException("Booking " + bookingId + " does not exist."));

        if (!PAYABLE_STATES.contains(booking.getState())) {
            throw new IllegalArgumentException(
                    "Booking " + bookingId + " is " + booking.getState() + " and cannot take a payment.");
        }

        return String.format(Locale.US, "%.2f", booking.getTotalUsdCents() / 100.0);
    }

    private static String valueOrDefault(Map<String, Object> payload, String key, String fallback) {
        Object value = payload == null ? null : payload.get(key);
        return value == null ? fallback : value.toString();
    }

    /**
     * Reads an id the client may have sent under either naming convention -
     * the web app speaks snake_case, the API speaks camelCase - and tolerates a
     * JSON number or a string. A value that is neither is treated as absent
     * rather than as an error: a malformed id must not stop a payment that the
     * gateway would otherwise accept.
     */
    private static Long longOrNull(Map<String, Object> payload, String... keys) {
        if (payload == null) {
            return null;
        }
        for (String key : keys) {
            Object value = payload.get(key);
            if (value instanceof Number number) {
                return number.longValue();
            }
            if (value != null) {
                try {
                    return Long.parseLong(value.toString().trim());
                } catch (NumberFormatException ignored) {
                    // Fall through to the next key.
                }
            }
        }
        return null;
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
