package com.eventbooking.catalog.error;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class InvalidEventStatusTransitionException extends ApiException {

    public InvalidEventStatusTransitionException() {
        super(ErrorCode.INVALID_EVENT_STATUS_TRANSITION,
                "The event status transition is not allowed");
    }

    public InvalidEventStatusTransitionException(EventStatus currentStatus, EventStatus targetStatus) {
        super(
                ErrorCode.INVALID_EVENT_STATUS_TRANSITION,
                "Cannot change event status from " + currentStatus + " to " + targetStatus
        );
    }
}
