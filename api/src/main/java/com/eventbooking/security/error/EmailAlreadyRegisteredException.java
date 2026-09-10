package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/** Registration hit the UNIQUE on {@code app_user.email}. */
public class EmailAlreadyRegisteredException extends ApiException {
    public EmailAlreadyRegisteredException() {
        super(ErrorCode.EMAIL_ALREADY_REGISTERED, "That email already has an account.");
    }
}
