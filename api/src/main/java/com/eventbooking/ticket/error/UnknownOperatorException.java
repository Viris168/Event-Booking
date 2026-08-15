package com.eventbooking.ticket.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The gate identified itself as a user that does not exist.
 *
 * <p>A 400 rather than a scan outcome: this says nothing about the ticket, and
 * a steward whose scanner is misconfigured needs to hear that rather than
 * "invalid ticket". Without this check the mistake surfaces as a 500 from
 * {@code ticket_checked_in_by_fkey} <em>after</em> the ticket has been
 * validated - a red screen for a perfectly good ticket, which is the worst
 * possible place to fail.
 */
public class UnknownOperatorException extends ApiException {
    public UnknownOperatorException(Long userId) {
        super(ErrorCode.UNKNOWN_OPERATOR,
                "No such user: " + userId + ". The gate must identify itself as a registered user.");
    }
}
