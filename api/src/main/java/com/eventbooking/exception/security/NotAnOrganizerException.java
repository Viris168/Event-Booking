package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The caller is not an organiser, so there is no id to own anything with.
 *
 * <p>Two different accounts land here and the answer is deliberately the same
 * for both: someone who never had an {@code organizer_profile} row, and someone
 * who has one but has since been demoted. The second used to be impossible -
 * demotion deleted the row - and it is now the ordinary case, because the row
 * has to survive for the events and venues that point at it. Both are told they
 * are not an organiser, which is true of both.
 *
 * <p>403 and not 401: the caller is identified fine, they are just not the kind
 * of account this endpoint is for.
 */
public class NotAnOrganizerException extends ApiException {
    public NotAnOrganizerException(Long actorUserId) {
        super(ErrorCode.NOT_AN_ORGANIZER, "User is not an organizer: " + actorUserId);
    }
}
