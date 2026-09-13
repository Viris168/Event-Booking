package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class HoldNotFoundException extends ApiException {
    public HoldNotFoundException(Long holdId) {
        super(ErrorCode.HOLD_NOT_FOUND, "Hold not found with ID: " + holdId);
    }
}
