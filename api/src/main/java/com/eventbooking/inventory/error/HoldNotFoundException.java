package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class HoldNotFoundException extends ApiException {
    public HoldNotFoundException(Long holdId) {
        super(ErrorCode.HOLD_NOT_FOUND, "Hold not found with ID: " + holdId);
    }
}
