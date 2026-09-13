package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * An action that would leave the platform with no administrator who can act.
 *
 * <p>There is no way back from zero through the API. Enabling an account is an
 * admin action, and {@link com.eventbooking.security.AdminResolver} refuses a
 * disabled admin - so the last one switching themselves off locks everybody
 * out, and the only remedy is a hand-written UPDATE against the database. That
 * is not a hypothetical: it is what this guard was written in response to.
 *
 * <p>409 rather than 403. The caller is a platform admin with every right to
 * ask; it is the resulting state that is impossible, not their authority.
 */
public class LastAdminException extends ApiException {

    /** Disabling or demoting the only administrator left who can sign in. */
    public static LastAdminException lastOne(String action) {
        return new LastAdminException(
                "This is the only administrator who can still sign in, so they cannot be "
                        + action + ". Promote a second administrator first.");
    }

    /**
     * An admin acting on their own account.
     *
     * <p>Refused whether or not others exist. Revoking your own access is never
     * something you need this screen for, and a mis-click on your own row is
     * the single most expensive one on it - the same reasoning that already
     * blocks changing your own role.
     */
    public static LastAdminException self() {
        return new LastAdminException(
                "You cannot disable your own administrator account. Ask another administrator.");
    }

    private LastAdminException(String message) {
        super(ErrorCode.LAST_ADMIN, message);
    }
}
