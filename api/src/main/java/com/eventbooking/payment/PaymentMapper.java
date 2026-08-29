package com.eventbooking.payment;

import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.model.ABA.PaywayCheckoutForm;
import com.eventbooking.model.PaymentTransaction;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;


@Component
public class PaymentMapper {

    private static final Logger log = LoggerFactory.getLogger(PaymentMapper.class);

    private static final ObjectMapper JSON = new ObjectMapper();

    private final PaymentProperties properties;

    public PaymentMapper(PaymentProperties properties) {
        this.properties = properties;
    }

    public PaymentResponse toResponse(PaymentTransaction attempt) {
        boolean open = attempt.isOpen();
        PaywayCheckoutForm checkoutForm = open ? parseCheckoutForm(attempt.getCheckoutForm()) : null;

        return new PaymentResponse(
                attempt.getId(),
                attempt.getBooking().getId(),
                attempt.getProvider(),
                attempt.getStatus(),
                attempt.getBooking().getState(),
                attempt.getCurrencyCharged(),
                attempt.getAmountUsdCents(),
                attempt.getAmountKhr(),
                // A settled attempt stops handing out something scannable: the
                // QR is spent, and rendering it again would invite a second
                // payment that has nowhere to go. The checkout form dies with
                // the attempt for the same reason.
                open ? attempt.getQrPayload() : null,
                attempt.getProviderRef(),
                attempt.getProviderTxnHash(),
                checkoutForm == null ? null : checkoutForm.getAction(),
                checkoutForm == null ? null : checkoutForm.getFields(),
                attempt.getExpiresAt(),
                attempt.getCreatedAt(),
                attempt.getResolvedAt(),
                attempt.getLastPolledAt(),
                attempt.getPollAttempts(),
                attempt.getNote(),
                open,
                // Server-driven cadence: the client asks again after this, and
                // the interval can be retuned without shipping a frontend. Zero
                // once settled, meaning "stop asking".
                open ? properties.poll().minRefreshInterval().toMillis() : 0L
        );
    }

    /** Reads the signed PayWay checkout form off the row; null when absent or unreadable. */
    private static PaywayCheckoutForm parseCheckoutForm(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return JSON.readValue(json, PaywayCheckoutForm.class);
        } catch (JsonProcessingException e) {
            log.warn("checkout_form column held unreadable JSON; hiding it from the client", e);
            return null;
        }
    }
}
