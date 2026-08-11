package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InsufficientZoneCapacityException extends ApiException {
    public InsufficientZoneCapacityException(String message) {
        super(ErrorCode.INSUFFICIENT_ZONE_CAPACITY, message);
    }
}
