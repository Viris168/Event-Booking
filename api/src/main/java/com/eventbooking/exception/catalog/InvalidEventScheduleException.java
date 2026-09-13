package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class InvalidEventScheduleException extends ApiException {
    public InvalidEventScheduleException(String message) {
        super(ErrorCode.INVALID_EVENT_SCHEDULE, message);
    }
}
