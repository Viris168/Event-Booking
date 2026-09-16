package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * What someone typed into the Telegram field is not a handle.
 *
 * <p>Raised after the decoration is stripped, never before: "@sokha" and
 * "https://t.me/sokha" both reach the server and both are accepted. This is for
 * what is left once they are not - a handle too short, too long, or holding
 * characters Telegram does not allow in one.
 *
 * <p>Checked in {@code AuthService} as well as by V32's CHECK constraint. The
 * constraint is the guarantee; this is the one that can say which field is
 * wrong and why, which a 23514 surfacing as a 500 cannot.
 */
public class InvalidTelegramUsernameException extends ApiException {
    public InvalidTelegramUsernameException() {
        super(ErrorCode.INVALID_TELEGRAM_USERNAME,
                "A Telegram username is 5-32 letters, numbers or underscores.");
    }
}
