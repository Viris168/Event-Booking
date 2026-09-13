package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * A first password was requested on an account that already has one.
 *
 * <p>The distinction matters: setting a first password needs no proof of the
 * old one because there is none, so the same endpoint accepting a replacement
 * would let a stolen access token change a password without knowing it. That
 * path is {@code /auth/change-password}, and it asks.
 */
public class PasswordAlreadySetException extends ApiException {
    public PasswordAlreadySetException() {
        super(ErrorCode.PASSWORD_ALREADY_SET,
                "This account already has a password. Change it instead.");
    }
}
