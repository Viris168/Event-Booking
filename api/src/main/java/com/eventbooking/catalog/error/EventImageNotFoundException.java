package com.eventbooking.catalog.error;

import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class EventImageNotFoundException extends ApiException {
    public EventImageNotFoundException(Long eventId, ImageRole role) {
        super(ErrorCode.EVENT_IMAGE_NOT_FOUND,
                "Event " + eventId + " has no " + role + " image to delete.");
    }
}
