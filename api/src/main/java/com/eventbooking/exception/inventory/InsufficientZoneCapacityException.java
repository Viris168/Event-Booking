package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InsufficientZoneCapacityException extends ApiException {
    public InsufficientZoneCapacityException(String message) {
        super(ErrorCode.INSUFFICIENT_ZONE_CAPACITY, message);
    }
}
