package com.eventbooking.organizer.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * This user already has an application waiting for a decision.
 *
 * <p>The database enforces this too, via the partial unique index
 * {@code uq_organizer_application_pending}. Checking it in the service is what
 * turns it into a 409 the applicant can read; letting the index catch it
 * produces a DataIntegrityViolationException and a 500.
 *
 * <p>Only PENDING rows collide. A rejected applicant may apply again, which is
 * the whole reason that index is partial rather than a plain UNIQUE.
 */
public class OrganizerApplicationAlreadyPendingException extends ApiException {
    public OrganizerApplicationAlreadyPendingException(Long actorUserId) {
        super(ErrorCode.ORGANIZER_APPLICATION_ALREADY_PENDING,
                "User already has a pending organizer application: " + actorUserId);
    }
}
