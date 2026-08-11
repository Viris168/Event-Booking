package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class SeatUnavailableException extends ApiException {
    public SeatUnavailableException(String message) {
        super(ErrorCode.SEAT_UNAVAILABLE, message);
    }
}
