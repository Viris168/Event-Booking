package com.eventbooking.exception.inventory;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class DuplicateSeatLocationException extends ApiException {
    public DuplicateSeatLocationException(String message) {
        super(ErrorCode.DUPLICATE_SEAT_LOCATION, message);
    }
}
