package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * One answer for every way a Google sign-in can fail verification.
 *
 * <p>Deliberately undifferentiated, for the reason {@link InvalidCredentialsException}
 * is: a caller who learns that the signature was fine but the audience wrong
 * has been told how to get closer.
 */
public class InvalidGoogleTokenException extends ApiException {
    public InvalidGoogleTokenException() {
        super(ErrorCode.INVALID_GOOGLE_TOKEN, "Could not verify that Google sign-in.");
    }
}
