package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The event has nothing a customer could buy, so there is nothing to review.
 *
 * <p>409 rather than 404: every row the caller named exists, the event is just
 * not in a state where submitting it means anything. And 409 rather than a
 * validation error because the problem is not in the request - the request is
 * fine, the event is empty.
 *
 * <p>The message names the specific gap (which tier, or which side of a MIXED
 * event) because "nothing on sale" sends the organiser back to a form with six
 * sections and no clue which one is wrong.
 */
public class NoInventoryException extends ApiException {
    public NoInventoryException(String detail) {
        super(ErrorCode.NO_INVENTORY, detail);
    }
}
