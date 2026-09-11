package com.eventbooking.organizer.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * No application with this id.
 *
 * <p>Thrown by the admin review path, which loads the row with a plain
 * findById - an admin does not own the application, so there is no ownership
 * helper to fall back on and a missing row is simply a 404.
 */
public class OrganizerApplicationNotFoundException extends ApiException {
    public OrganizerApplicationNotFoundException(Long applicationId) {
        super(ErrorCode.ORGANIZER_APPLICATION_NOT_FOUND,
                "Organizer application not found: " + applicationId);
    }
}
