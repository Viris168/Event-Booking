package com.eventbooking.exception.booking;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class BookingNotFoundException extends ApiException {
    public BookingNotFoundException(String message) {
        super(ErrorCode.BOOKING_NOT_FOUND, message);
    }
}
