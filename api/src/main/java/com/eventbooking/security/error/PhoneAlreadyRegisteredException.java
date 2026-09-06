package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Registration hit the UNIQUE on {@code app_user.phone_e164}.
 *
 * <p>Checked before inserting so the answer is a clean 409 rather than a raw
 * 23505 translated after the fact. This does leak that a number is registered -
 * unavoidable for a signup form, which has to say the number is taken.
 */
public class PhoneAlreadyRegisteredException extends ApiException {
    public PhoneAlreadyRegisteredException() {
        super(ErrorCode.PHONE_ALREADY_REGISTERED, "That phone number already has an account.");
    }
}
