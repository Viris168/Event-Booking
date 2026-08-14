package com.eventbooking.payment.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * This booking has already been paid. Refusing a second attempt here is the
 * polite version of the guarantee; {@code uq_payment_txn_one_success_per_booking}
 * is the one that actually holds when two requests race.
 */
public class PaymentAlreadySettledException extends ApiException {
    public PaymentAlreadySettledException(String message) {
        super(ErrorCode.PAYMENT_ALREADY_SETTLED, message);
    }
}
