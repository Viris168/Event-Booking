package com.eventbooking.exception.payout;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * Asked to read a receipt on a deployment that has no vision key configured.
 *
 * <p>503 rather than 404 or 501: the endpoint exists and will work the moment
 * somebody sets {@code app.receipt-extraction.api-key}, which is exactly what
 * "temporarily unavailable" means. The client's correct response is to hide the
 * drop zone and leave the admin typing, not to retry.
 */
public class ReceiptExtractionUnavailableException extends ApiException {
    public ReceiptExtractionUnavailableException() {
        super(ErrorCode.RECEIPT_EXTRACTION_UNAVAILABLE,
                "Receipt extraction is not configured on this deployment");
    }
}
