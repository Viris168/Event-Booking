package com.eventbooking.payment.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Also thrown for a payment that belongs to somebody else's booking - the same
 * reasoning as holds and bookings: reporting "forbidden" would confirm the id
 * exists, so ids stay unwalkable.
 */
public class PaymentNotFoundException extends ApiException {
    public PaymentNotFoundException(Long paymentId) {
        super(ErrorCode.PAYMENT_NOT_FOUND, "Payment " + paymentId + " does not exist.");
    }
}
