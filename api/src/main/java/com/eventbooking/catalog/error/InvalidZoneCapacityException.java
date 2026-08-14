package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InvalidZoneCapacityException extends ApiException {
    public InvalidZoneCapacityException(Long zoneId) {
        super(ErrorCode.INVALID_ZONE_CAPACITY, "Zone capacity cannot be below sold or held quantity for zone: " + zoneId);
    }
}
