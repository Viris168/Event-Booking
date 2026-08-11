package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class EventNotFoundException extends ApiException {
    public EventNotFoundException(Long eventId) {
        super(ErrorCode.EVENT_NOT_FOUND, "Event not found with ID: " + eventId);
    }
}
