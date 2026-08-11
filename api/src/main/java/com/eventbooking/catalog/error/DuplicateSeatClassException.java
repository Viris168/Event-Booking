package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class DuplicateSeatClassException extends ApiException {
    public DuplicateSeatClassException(String message) {
        super(ErrorCode.DUPLICATE_SEAT_CLASS_NAME, message);
    }
}
