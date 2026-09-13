package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/** Removing the only way in. An account created through Google has no password, so unlinking would strand its owner outside a row that still holds their bookings. */
public class LastSignInMethodException extends ApiException {
    public LastSignInMethodException() {
        super(ErrorCode.LAST_SIGN_IN_METHOD, "Set a password first - Google is currently the only way into this account.");
    }
}
