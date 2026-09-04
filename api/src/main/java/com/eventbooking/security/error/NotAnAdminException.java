package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The caller is not a PLATFORM_ADMIN.
 *
 * <p>403 rather than 401 for the same reason as {@link NotAnOrganizerException}:
 * we know who they are, they are simply not the kind of account the moderation
 * endpoints are for.
 */
public class NotAnAdminException extends ApiException {
    public NotAnAdminException(Long actorUserId) {
        super(ErrorCode.NOT_AN_ADMIN, "User is not a platform admin: " + actorUserId);
    }
}
