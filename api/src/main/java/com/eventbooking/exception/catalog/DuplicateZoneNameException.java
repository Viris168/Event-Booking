package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class DuplicateZoneNameException extends ApiException {
    public DuplicateZoneNameException(String message) {
        super(ErrorCode.DUPLICATE_ZONE_NAME, message);
    }
}
