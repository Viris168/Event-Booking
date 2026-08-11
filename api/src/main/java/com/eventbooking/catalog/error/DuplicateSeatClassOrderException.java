package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class DuplicateSeatClassOrderException extends ApiException {
    public DuplicateSeatClassOrderException(String message) {
        super(ErrorCode.DUPLICATE_SEAT_CLASS_ORDER, message);
    }
}
