package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class SeatClassNotFoundException extends ApiException {
    public SeatClassNotFoundException(Long seatClassId) {
        super(ErrorCode.SEAT_CLASS_NOT_FOUND, "Seat class not found with ID: " + seatClassId);
    }
}
