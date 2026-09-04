package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The caller has no {@code organizer_profile} row, so there is no id to own
 * anything with.
 *
 * <p>This is the organiser check. Having a profile is what being an organiser
 * consists of - {@code AppUser.role} never has to be read, which means the
 * check cannot drift out of sync with the table that actually holds ownership.
 *
 * <p>403 and not 401: the caller is identified fine, they are just not the kind
 * of account this endpoint is for.
 */
public class NotAnOrganizerException extends ApiException {
    public NotAnOrganizerException(Long actorUserId) {
        super(ErrorCode.NOT_AN_ORGANIZER, "User is not an organizer: " + actorUserId);
    }
}
