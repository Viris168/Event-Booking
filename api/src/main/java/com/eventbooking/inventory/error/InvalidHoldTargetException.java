package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InvalidHoldTargetException extends ApiException {
    public InvalidHoldTargetException(String message) {
        super(ErrorCode.INVALID_HOLD_TARGET, message);
    }
}
