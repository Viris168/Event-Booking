package com.eventbooking.dto.payment;

import com.eventbooking.Enumeration.PaymentProvider;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * Opens a payment attempt on a booking.
 *
 * <p>No amount and no currency: both come from the booking, which snapshotted
 * its totals and its FX rate at checkout. A client that could name its own
 * amount is a client that can underpay.
 */
public record StartPaymentRequest(

        @Schema(description = "Only BAKONG_KHQR is implemented; ABA_PAYWAY answers 501.",
                example = "BAKONG_KHQR", requiredMode = Schema.RequiredMode.REQUIRED)
        @NotNull(message = "provider is required")
        PaymentProvider provider
) {
}
