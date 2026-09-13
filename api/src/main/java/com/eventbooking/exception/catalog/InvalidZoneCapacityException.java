package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InvalidZoneCapacityException extends ApiException {
    public InvalidZoneCapacityException(Long zoneId) {
        super(ErrorCode.INVALID_ZONE_CAPACITY, "Zone capacity cannot be below sold or held quantity for zone: " + zoneId);
    }
}
