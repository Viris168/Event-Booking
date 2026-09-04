package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The caller is an organiser, just not this row's organiser.
 *
 * <p>Distinct from {@link NotAnOrganizerException} on purpose: the client can
 * tell "your account cannot do this at all" from "this belongs to someone
 * else", and only the first is worth sending the user to sign up.
 *
 * <p>Deliberately 403 rather than 404. Hiding another organiser's event behind
 * a 404 would leak less, but ids here are sequential and already public on
 * every listing page, so there is nothing left to conceal - and a 404 would
 * send an organiser hunting for an event they can plainly see exists.
 */
public class NotResourceOwnerException extends ApiException {
    public NotResourceOwnerException(String resource, Long resourceId) {
        super(ErrorCode.NOT_RESOURCE_OWNER,
                "Not the owner of " + resource + ": " + resourceId);
    }
}
