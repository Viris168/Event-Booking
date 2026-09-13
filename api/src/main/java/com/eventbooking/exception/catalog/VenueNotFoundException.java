package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class VenueNotFoundException extends ApiException {
    public VenueNotFoundException(Long venueId) {
        super(ErrorCode.VENUE_NOT_FOUND, "Venue not found with ID: " + venueId);
    }
}
