package com.eventbooking.exception.payout;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * No payout with this id, or none this caller may see.
 *
 * <p>Both, deliberately. The organiser-facing lookups scope by organizerId and
 * throw this when the scoped query misses, so somebody else's invoice is
 * reported as absent rather than as forbidden - a 403 would confirm that the id
 * exists, which is how an invoice number becomes an enumeration oracle for
 * other organisers' revenue.
 */
public class PayoutRequestNotFoundException extends ApiException {
    public PayoutRequestNotFoundException(Long payoutId) {
        super(ErrorCode.PAYOUT_REQUEST_NOT_FOUND, "Payout request not found: " + payoutId);
    }
}
