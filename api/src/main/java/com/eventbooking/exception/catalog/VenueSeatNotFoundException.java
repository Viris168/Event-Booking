package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class VenueSeatNotFoundException extends ApiException {
    public VenueSeatNotFoundException(Long venueSeatId) {
        super(ErrorCode.VENUE_SEAT_NOT_FOUND, "Venue seat not found with ID: " + venueSeatId);
    }
}
