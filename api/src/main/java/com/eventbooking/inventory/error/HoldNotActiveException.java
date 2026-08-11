package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class HoldNotActiveException extends ApiException {
    public HoldNotActiveException(String message) {
        super(ErrorCode.HOLD_NOT_ACTIVE, message);
    }
}
