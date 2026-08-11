package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class DuplicateZoneNameException extends ApiException {
    public DuplicateZoneNameException(String message) {
        super(ErrorCode.DUPLICATE_ZONE_NAME, message);
    }
}
