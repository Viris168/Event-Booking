package com.eventbooking.booking.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class BookingNotFoundException extends ApiException {
    public BookingNotFoundException(String message) {
        super(ErrorCode.BOOKING_NOT_FOUND, message);
    }
}
