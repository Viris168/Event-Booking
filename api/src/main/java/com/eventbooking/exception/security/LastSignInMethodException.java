package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * Removing the only way in.
 *
 * <p>Two shapes of the same mistake, which is why the message is a parameter.
 * Unlinking Google from an account created through it strands the owner outside
 * a row that still holds their bookings - there is no password to fall back on.
 * Clearing {@code phone_e164} from the admin users screen does the same thing
 * from the other direction: the phone is the login identifier, so an account
 * with no linked Google identity has nothing left to sign in with.
 *
 * <p>Same code either way - the refusal is identical and so is the remedy, which
 * is to add the other method before removing this one. Only the sentence differs,
 * and it has to: telling an admin to "set a password first" when they just
 * blanked somebody's phone number describes a different problem.
 */
public class LastSignInMethodException extends ApiException {

    /** The Google unlink path. */
    public LastSignInMethodException() {
        this("Set a password first - Google is currently the only way into this account.");
    }

    public LastSignInMethodException(String message) {
        super(ErrorCode.LAST_SIGN_IN_METHOD, message);
    }
}
