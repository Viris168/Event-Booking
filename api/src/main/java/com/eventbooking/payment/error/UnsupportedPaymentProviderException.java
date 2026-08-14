package com.eventbooking.payment.error;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The provider is a real value of {@link PaymentProvider} - the column and the
 * web's provider switch both know it - but this build has no adapter for it.
 * 501 rather than 400: the request was not wrong, the server is simply not
 * finished. ABA PayWay is the only such value today.
 */
public class UnsupportedPaymentProviderException extends ApiException {
    public UnsupportedPaymentProviderException(PaymentProvider provider) {
        super(ErrorCode.PAYMENT_PROVIDER_UNSUPPORTED,
                provider + " is not implemented yet; use BAKONG_KHQR.");
    }
}
