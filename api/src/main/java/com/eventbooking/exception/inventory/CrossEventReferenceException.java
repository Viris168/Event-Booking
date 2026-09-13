package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class CrossEventReferenceException extends ApiException {
    public CrossEventReferenceException(String message) {
        super(ErrorCode.CROSS_EVENT_REFERENCE, message);
    }
}
