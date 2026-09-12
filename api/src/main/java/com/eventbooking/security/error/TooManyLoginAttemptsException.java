package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

import java.util.Map;

/**
 * Too many failed sign-ins from this address, or against this account.
 *
 * <p>Deliberately raised for accounts that do not exist as readily as for ones
 * that do. The counter is incremented by a failed attempt, and a failed attempt
 * looks identical either way, so this cannot be used to discover which phone
 * numbers are registered - the same reason
 * {@link InvalidCredentialsException} says so little.
 *
 * <p>Marked retryable, because it is: {@code retry_after_seconds} says when.
 */
public class TooManyLoginAttemptsException extends ApiException {

    public TooManyLoginAttemptsException(long retryAfterSeconds) {
        super(ErrorCode.TOO_MANY_LOGIN_ATTEMPTS,
                "Too many sign-in attempts. Try again in "
                        + Math.max(1, (retryAfterSeconds + 59) / 60) + " minute(s).",
                true,
                Map.of("retry_after_seconds", retryAfterSeconds));
    }
}
