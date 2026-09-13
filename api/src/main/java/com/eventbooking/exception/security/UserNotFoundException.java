package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The admin screens named an {@code app_user} id that is not there.
 *
 * <p>Replaces the bare {@code IllegalArgumentException} AdminUserService used
 * to throw, which reached the client as a 500 - so an admin clicking a row
 * another admin had just removed saw "something went wrong" rather than "that
 * account is gone". Nothing about the situation is a server fault.
 *
 * <p>Deliberately not {@code NotAuthenticatedException}. That one is about the
 * caller; this is about the row being acted on, and collapsing the two would
 * log an authenticated admin out over somebody else's deleted account.
 */
public class UserNotFoundException extends ApiException {
    public UserNotFoundException(Long userId) {
        super(ErrorCode.USER_NOT_FOUND, "No user with id " + userId);
    }
}
