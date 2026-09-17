package com.eventbooking.exception.payout;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The provider was reached and the answer was not usable.
 *
 * <p>Covers a timeout, a refusal, a malformed body, and a reply that was not
 * the JSON it was asked for. They are one error on purpose: the admin's next
 * move is identical in every case - read the reference off the screenshot
 * themselves and type it - so splitting them would only make the dialog choose
 * between four sentences that all end "type it in".
 *
 * <p>502 rather than 500: nothing here is wrong with this application, and an
 * outage in somebody else's API should not read as a bug in ours when somebody
 * goes through the logs later.
 */
public class ReceiptExtractionFailedException extends ApiException {
    public ReceiptExtractionFailedException(String detail) {
        super(ErrorCode.RECEIPT_EXTRACTION_FAILED,
                "Could not read the receipt: " + detail);
    }
}
