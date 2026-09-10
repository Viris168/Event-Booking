package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The credentials were right, but {@code app_user.is_disabled} is set.
 *
 * <p>Distinct from bad credentials on purpose: the person has proven who they
 * are, so telling them the account is disabled reveals nothing they did not
 * already know, and "wrong password" would send them round a reset loop that
 * cannot help.
 */
public class AccountDisabledException extends ApiException {
    public AccountDisabledException() {
        super(ErrorCode.ACCOUNT_DISABLED, "This account has been disabled. Contact support.");
    }
}
