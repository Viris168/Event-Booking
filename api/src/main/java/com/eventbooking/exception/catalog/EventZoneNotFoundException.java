package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class EventZoneNotFoundException extends ApiException {
    public EventZoneNotFoundException(Long zoneId) {
        super(ErrorCode.ZONE_NOT_FOUND, "Event zone not found with ID: " + zoneId);
    }
}
