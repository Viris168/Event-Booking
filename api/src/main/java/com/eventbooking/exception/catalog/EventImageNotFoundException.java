package com.eventbooking.exception.catalog;

import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class EventImageNotFoundException extends ApiException {
    public EventImageNotFoundException(Long eventId, ImageRole role) {
        super(ErrorCode.EVENT_IMAGE_NOT_FOUND,
                "Event " + eventId + " has no " + role + " image to delete.");
    }
}
