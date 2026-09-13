package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * A fourth administrator.
 *
 * <p>Every admin sees all platform data and can act on any of it - there is no
 * per-admin scoping anywhere in the product - so the list is capped small
 * enough to read at a glance and audit by eye.
 *
 * <p>The cap counts administrators that exist, not ones that can sign in: a
 * disabled admin still holds the seat, because re-enabling them is one click
 * and should never be blocked by a limit.
 */
public class AdminLimitReachedException extends ApiException {
    public AdminLimitReachedException(int max) {
        super(ErrorCode.ADMIN_LIMIT_REACHED,
                "The platform allows at most " + max + " administrators. Demote one before "
                        + "promoting somebody else.");
    }
}
