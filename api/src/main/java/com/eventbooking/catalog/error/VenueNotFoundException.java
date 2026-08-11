package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class VenueNotFoundException extends ApiException {
    public VenueNotFoundException(Long venueId) {
        super(ErrorCode.VENUE_NOT_FOUND, "Venue not found with ID: " + venueId);
    }
}
