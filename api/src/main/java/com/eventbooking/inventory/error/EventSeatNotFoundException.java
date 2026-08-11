package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class EventSeatNotFoundException extends ApiException {
    public EventSeatNotFoundException(Long seatId) {
        super(ErrorCode.SEAT_NOT_FOUND, "Event seat not found with ID: " + seatId);
    }
}
