package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class DuplicateSeatClassException extends ApiException {
    public DuplicateSeatClassException(String message) {
        super(ErrorCode.DUPLICATE_SEAT_CLASS_NAME, message);
    }
}
