package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InvalidEventScheduleException extends ApiException {
    public InvalidEventScheduleException(String message) {
        super(ErrorCode.INVALID_EVENT_SCHEDULE, message);
    }
}
