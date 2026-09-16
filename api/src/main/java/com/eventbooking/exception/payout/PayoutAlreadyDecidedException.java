package com.eventbooking.exception.payout;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The admin action does not apply from the state this row is in.
 *
 * <p>Approve wants REQUESTED; mark-paid wants APPROVED. Like
 * {@code OrganizerApplicationAlreadyDecidedException} this is not a defensive
 * check against a bug - two admins working the queue at once is the ordinary
 * way to reach it, and the second one deserves to be told what their colleague
 * did rather than to silently overwrite it.
 *
 * <p>It matters more here than it does for applications. Overwriting a decision
 * on an application costs an audit trail; re-approving a payout that has
 * already been PAID would put the same event back in the queue to be
 * transferred a second time.
 *
 * @param expected what the action needed, so the message says which action was
 *                 attempted rather than only which state blocked it
 */
public class PayoutAlreadyDecidedException extends ApiException {
    public PayoutAlreadyDecidedException(Long payoutId, PayoutStatus actual, PayoutStatus expected) {
        super(ErrorCode.PAYOUT_ALREADY_DECIDED,
                "Payout request " + payoutId + " is " + actual + ", and that action needs " + expected);
    }
}
