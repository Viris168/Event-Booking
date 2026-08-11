package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class CrossEventReferenceException extends ApiException {
    public CrossEventReferenceException(String message) {
        super(ErrorCode.CROSS_EVENT_REFERENCE, message);
    }
}
