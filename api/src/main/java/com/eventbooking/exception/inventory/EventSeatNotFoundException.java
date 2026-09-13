package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class EventSeatNotFoundException extends ApiException {
    public EventSeatNotFoundException(Long seatId) {
        super(ErrorCode.SEAT_NOT_FOUND, "Event seat not found with ID: " + seatId);
    }
}
