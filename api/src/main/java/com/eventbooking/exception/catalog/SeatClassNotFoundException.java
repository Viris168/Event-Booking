package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class SeatClassNotFoundException extends ApiException {
    public SeatClassNotFoundException(Long seatClassId) {
        super(ErrorCode.SEAT_CLASS_NOT_FOUND, "Seat class not found with ID: " + seatClassId);
    }
}
