package com.eventbooking.organizer.error;

import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Approve or reject arrived for a row that is no longer PENDING.
 *
 * <p>Not a defensive check against a bug: two admins working the queue at the
 * same time is the ordinary way to reach this, and the second one deserves to
 * be told the decision was already made rather than to silently overwrite the
 * first one's reviewedBy and adminNote.
 *
 * <p>The current status is in the message because "already decided" is not an
 * answer - the admin wants to know whether their colleague approved or rejected
 * it.
 */
public class OrganizerApplicationAlreadyDecidedException extends ApiException {
    public OrganizerApplicationAlreadyDecidedException(Long applicationId,
                                                       OrganizerApplicationStatus status) {
        super(ErrorCode.ORGANIZER_APPLICATION_ALREADY_DECIDED,
                "Organizer application " + applicationId + " is already " + status);
    }
}
