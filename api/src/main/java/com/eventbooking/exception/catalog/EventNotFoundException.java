package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class EventNotFoundException extends ApiException {
    public EventNotFoundException(Long eventId) {
        super(ErrorCode.EVENT_NOT_FOUND, "Event not found with ID: " + eventId);
    }
}
