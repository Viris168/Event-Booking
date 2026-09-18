package com.eventbooking.exception.contact;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * An admin asked to set a message back to NEW.
 *
 * <p>NEW does not mean "not finished", it means "nobody has looked at this" -
 * and {@code contact_message_handled_consistent} enforces that reading by
 * requiring {@code handled_by} and {@code handled_at} to be null in that
 * status. Honouring the request would mean erasing the record of the admin who
 * had, in fact, just looked at it.
 *
 * <p>400 rather than 409: nothing about the row's state makes this impossible,
 * the destination itself is not a legal one. OPEN is what an admin means when
 * they want to put something back in the queue.
 */
public class InvalidContactStatusException extends ApiException {
    public InvalidContactStatusException() {
        super(ErrorCode.INVALID_CONTACT_STATUS,
                "A message cannot be moved back to NEW. Use OPEN to return it to the queue.");
    }
}
