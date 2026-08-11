package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class DuplicateSeatLocationException extends ApiException {
    public DuplicateSeatLocationException(String message) {
        super(ErrorCode.DUPLICATE_SEAT_LOCATION, message);
    }
}
