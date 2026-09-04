package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * A disabled venue still exists and still backs every event already scheduled
 * there, so it is not a 404 - reading it is fine. What it can no longer do is
 * take on new work: binding a fresh event to it, or moving an existing one onto
 * it, would quietly grow the set of events that have to be unwound if the venue
 * is ever really gone. 409 rather than 400 because the request is well formed;
 * it is the venue's state that refuses it.
 */
public class VenueDisabledException extends ApiException {
    public VenueDisabledException(Long venueId) {
        super(ErrorCode.VENUE_DISABLED, "Venue is disabled and cannot host events: " + venueId);
    }
}
