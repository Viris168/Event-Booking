package com.eventbooking.dto.payment;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

/**
 * One payment attempt, shaped for the screen that waits on it.
 *
 * <p>It deliberately carries more than the payment row: {@code bookingState}
 * and {@code pollAfterMs} are here so a client can drive the entire wait from
 * this one response - render the QR, poll on the interval the server asks for,
 * and move to the tickets the moment the booking reads CONFIRMED - without a
 * second request or a hard-coded timer.
 *
 * @param qrPayload  the EMVCo/KHQR string to render as a QR image. Null once
 *                   the attempt is settled, because a closed attempt must not
 *                   keep offering something scannable
 * @param providerRef Bakong's md5 for this QR, the key the reconciler polls with
 * @param open       true while the attempt can still be paid. The client's
 *                   "keep polling" flag, so the states it has to enumerate
 *                   stay in one place - here
 * @param pollAfterMs how long to wait before asking again. Server-driven so the
 *                   cadence can be tuned without shipping a new frontend
 */
@Schema(description = "A single payment attempt on a booking.")
public record PaymentResponse(

        Long id,
        Long bookingId,
        PaymentProvider provider,

        @Schema(description = "CREATED = QR issued, provider not asked yet. PENDING = provider "
                + "reachable, money not in. Then one of SUCCESS / FAILED / CANCELLED / EXPIRED.")
        PaymentStatus status,

        @Schema(description = "The booking's state as of this response - CONFIRMED is the "
                + "signal to stop polling and show the tickets.")
        BookingStatus bookingState,

        PaymentCurrency currencyCharged,
        Long amountUsdCents,
        Long amountKhr,

        String qrPayload,
        String providerRef,
        String providerTxnHash,

        Instant expiresAt,
        Instant createdAt,
        Instant resolvedAt,
        Instant lastPolledAt,
        Integer pollAttempts,

        @Schema(description = "Reconciler note: a decline reason, or a flag for an operator.")
        String note,

        boolean open,
        long pollAfterMs
) {
}
