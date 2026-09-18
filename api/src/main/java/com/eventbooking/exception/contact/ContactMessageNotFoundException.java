package com.eventbooking.exception.contact;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * An admin acted on a message id that is not in the table.
 *
 * <p>Only reachable from the admin inbox, so there is no disclosure question
 * here of the kind {@code PAYOUT_REQUEST_NOT_FOUND} has to weigh: every caller
 * who can provoke this is already allowed to list every row. Two admins working
 * the inbox at once is the ordinary way to reach it.
 */
public class ContactMessageNotFoundException extends ApiException {
    public ContactMessageNotFoundException(Long id) {
        super(ErrorCode.CONTACT_MESSAGE_NOT_FOUND, "Contact message not found: " + id);
    }
}
