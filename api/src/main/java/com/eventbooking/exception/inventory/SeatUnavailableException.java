package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class SeatUnavailableException extends ApiException {
    public SeatUnavailableException(String message) {
        super(ErrorCode.SEAT_UNAVAILABLE, message);
    }
}
