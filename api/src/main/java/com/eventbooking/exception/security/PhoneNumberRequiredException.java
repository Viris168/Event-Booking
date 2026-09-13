package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * An action needs the account's phone number and there isn't one yet.
 *
 * <p>Raised when setting a first password on an account created through Google:
 * the phone number is the login identifier, so a password without one is a
 * credential that cannot be used to sign in anywhere.
 */
public class PhoneNumberRequiredException extends ApiException {
    public PhoneNumberRequiredException() {
        super(ErrorCode.PHONE_NUMBER_REQUIRED,
                "Add your phone number first - it is what you sign in with.");
    }
}
