package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The account already has a phone number, and this endpoint only fills a null.
 *
 * <p>Replacing one is deliberately not offered: the number is the login
 * identifier and the access token's subject.
 */
public class PhoneAlreadySetException extends ApiException {
    public PhoneAlreadySetException() {
        super(ErrorCode.PHONE_NUMBER_REQUIRED, "This account already has a phone number.");
    }
}
