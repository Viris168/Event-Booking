package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class DuplicateSeatClassOrderException extends ApiException {
    public DuplicateSeatClassOrderException(String message) {
        super(ErrorCode.DUPLICATE_SEAT_CLASS_ORDER, message);
    }
}
