package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/** Removing the only way in. An account created through Google has no password, so unlinking would strand its owner outside a row that still holds their bookings. */
public class LastSignInMethodException extends ApiException {
    public LastSignInMethodException() {
        super(ErrorCode.LAST_SIGN_IN_METHOD, "Set a password first - Google is currently the only way into this account.");
    }
}
