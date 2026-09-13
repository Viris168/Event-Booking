package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class HoldNotActiveException extends ApiException {
    public HoldNotActiveException(String message) {
        super(ErrorCode.HOLD_NOT_ACTIVE, message);
    }
}
