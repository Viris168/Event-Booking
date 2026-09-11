package com.eventbooking.organizer.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The applicant already has an {@code organizer_profile} row.
 *
 * <p>409 rather than 403: they are not being refused permission, they are
 * asking for something they already have. Since V13 the existence of that row
 * IS what being an organiser means, so there is nothing an approval could add.
 *
 * <p>Also the guard that stops an approval from demoting someone: role is
 * single-valued, so writing ORGANIZER over a PLATFORM_ADMIN would strip their
 * admin rights. Refusing the application at submission keeps that row from
 * ever reaching the queue.
 */
public class AlreadyAnOrganizerException extends ApiException {
    public AlreadyAnOrganizerException(Long actorUserId) {
        super(ErrorCode.ALREADY_AN_ORGANIZER,
                "User is already an organizer: " + actorUserId);
    }
}
