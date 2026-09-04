package com.eventbooking.catalog.error;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The event is in a state where its fields are not the organiser's to change.
 *
 * <p>Separate from {@link InvalidEventStatusTransitionException} because the
 * caller did not ask for a transition. Reusing that one produced "Cannot SUBMIT
 * an event that is APPROVED" in response to a PATCH that never mentioned
 * submitting, which tells the organiser to do something they were not trying to
 * do. The message here names the way out instead.
 */
public class EventNotEditableException extends ApiException {
    public EventNotEditableException(EventStatus status) {
        super(ErrorCode.EVENT_NOT_EDITABLE, switch (status) {
            case PENDING_REVIEW -> "This event is being reviewed and cannot be edited. "
                    + "Withdraw it from review first.";
            case APPROVED -> "This event is approved and cannot be edited. "
                    + "Withdraw it back to draft first - it will need reviewing again.";
            default -> "An event with status " + status + " cannot be edited.";
        });
    }
}
