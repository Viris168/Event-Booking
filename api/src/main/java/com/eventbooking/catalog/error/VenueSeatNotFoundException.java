package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class VenueSeatNotFoundException extends ApiException {
    public VenueSeatNotFoundException(Long venueSeatId) {
        super(ErrorCode.VENUE_SEAT_NOT_FOUND, "Venue seat not found with ID: " + venueSeatId);
    }
}
