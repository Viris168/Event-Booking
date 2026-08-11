package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class HoldExpiredException extends ApiException {
    public HoldExpiredException(Long holdId) {
        super(ErrorCode.HOLD_EXPIRED, "Hold has expired and is no longer valid: " + holdId);
    }
}
