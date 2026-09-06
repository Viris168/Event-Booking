package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Unknown, already revoked, or expired - one exception for all three.
 *
 * <p>The client's next move is identical in each case: log in again. Telling it
 * which of the three applied would also tell someone probing with stolen values
 * whether a token was ever real.
 */
public class InvalidRefreshTokenException extends ApiException {
    public InvalidRefreshTokenException() {
        super(ErrorCode.INVALID_REFRESH_TOKEN, "This session has ended. Please sign in again.");
    }
}
