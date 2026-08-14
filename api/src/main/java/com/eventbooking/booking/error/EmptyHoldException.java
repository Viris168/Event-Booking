package com.eventbooking.booking.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * A hold with neither seats nor zone lines cannot become a booking:
 * booking.subtotal_usd_cents has a CHECK (> 0), so a zero-line booking
 * would be rejected by the database anyway.
 */
public class EmptyHoldException extends ApiException {
    public EmptyHoldException(String message) {
        super(ErrorCode.EMPTY_HOLD, message);
    }
}
