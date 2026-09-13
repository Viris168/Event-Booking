package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InvalidHoldTargetException extends ApiException {
    public InvalidHoldTargetException(String message) {
        super(ErrorCode.INVALID_HOLD_TARGET, message);
    }
}
