package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * A role change the platform cannot carry out.
 *
 * <p>Two situations reach this, and neither is a permission problem - the
 * caller is a platform admin with every right to ask:
 *
 * <ul>
 *   <li><b>Demoting an organiser who still owns things.</b> Ownership columns
 *       point at {@code organizer_profile.id}, and dropping the role means
 *       dropping that row - which would orphan every event and venue hanging
 *       off it. The events have to be moved or removed first.</li>
 *   <li><b>An admin editing their own role.</b> One mis-click would revoke the
 *       only account that can undo it, and nothing short of a hand-written
 *       UPDATE gets the platform back.</li>
 *   <li><b>Promoting to ORGANIZER with no organisation name.</b> The promotion
 *       creates the {@code organizer_profile} row, and that row's name columns
 *       are NOT NULL - there is nothing to fall back on that would not be a
 *       guess printed on a public event page.</li>
 * </ul>
 */
public class RoleChangeBlockedException extends ApiException {
    public RoleChangeBlockedException(String reason) {
        super(ErrorCode.ROLE_CHANGE_BLOCKED, reason);
    }
}
