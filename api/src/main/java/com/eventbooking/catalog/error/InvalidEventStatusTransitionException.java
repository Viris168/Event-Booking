package com.eventbooking.catalog.error;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
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

    /**
     * Names the action rather than the target status. Once transitions are
     * verbs, "cannot APPROVE an event that is DRAFT" is the sentence the caller
     * needs - the target status is the part they did not ask for and cannot act
     * on.
     */
    public InvalidEventStatusTransitionException(EventStatus currentStatus, EventTransition transition) {
        super(
                ErrorCode.INVALID_EVENT_STATUS_TRANSITION,
                "Cannot " + transition + " an event that is " + currentStatus
        );
    }
}
