package com.eventbooking.payment;

import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.model.PaymentTransaction;
import org.springframework.stereotype.Component;

/**
 * Entity -> DTO for the payment lane. Like {@code BookingMapper}, it must be
 * called inside the transaction that loaded the attempt: open-in-view is off
 * and it walks the booking association to report the state a waiting client is
 * really after.
 */
@Component
public class PaymentMapper {

    private final PaymentProperties properties;

    public PaymentMapper(PaymentProperties properties) {
        this.properties = properties;
    }

    public PaymentResponse toResponse(PaymentTransaction attempt) {
        boolean open = attempt.isOpen();

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
                // payment that has nowhere to go.
                open ? attempt.getQrPayload() : null,
                attempt.getProviderRef(),
                attempt.getProviderTxnHash(),
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
}
