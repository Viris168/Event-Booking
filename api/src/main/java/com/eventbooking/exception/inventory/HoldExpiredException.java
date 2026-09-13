package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class HoldExpiredException extends ApiException {
    public HoldExpiredException(Long holdId) {
        super(ErrorCode.HOLD_EXPIRED, "Hold has expired and is no longer valid: " + holdId);
    }
}
