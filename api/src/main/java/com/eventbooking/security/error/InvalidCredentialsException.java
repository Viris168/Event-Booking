package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Thrown for an unknown phone and for a wrong password alike, with the same
 * message either way.
 *
 * <p>Splitting the two would make login an oracle for which phone numbers hold
 * an account: an attacker submits a number with any password and reads the
 * difference. The cost of being vague is a slightly less helpful error; the
 * cost of being specific is handing over the user list.
 */
public class InvalidCredentialsException extends ApiException {
    public InvalidCredentialsException() {
        super(ErrorCode.INVALID_CREDENTIALS, "Incorrect phone number or password.");
    }
}
