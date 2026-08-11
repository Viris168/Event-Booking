package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class EventZoneNotFoundException extends ApiException {
    public EventZoneNotFoundException(Long zoneId) {
        super(ErrorCode.ZONE_NOT_FOUND, "Event zone not found with ID: " + zoneId);
    }
}
