package com.eventbooking.dto.payout;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * What a vision model read off a transfer confirmation screenshot.
 *
 * <p><b>Every field is a suggestion, and every field is nullable.</b> Nothing
 * here is stored. The screenshot is not stored either - it is held in memory
 * for one request, encoded, sent, and dropped. The only value that survives
 * this flow is whatever the admin leaves in the reference box when they submit
 * the mark-paid form, and that is a field they can overwrite.
 *
 * <p>So this is deliberately not typed. {@code amount} is a String rather than
 * a long of cents because it is the characters the model saw, not money the
 * platform has reasoned about - parsing it into a currency type here would
 * dress a guess up as an accounting figure. The same goes for {@code date}: no
 * Instant, because the receipt's own formatting is what the admin is checking
 * against, and normalising it would hide a misread rather than reveal one.
 *
 * @param amount          as printed on the receipt, e.g. "$1,250.00"
 * @param date            as printed, in whatever format the bank used
 * @param referenceNumber the transaction id - the field this whole flow exists
 *                        to capture, since it is what {@code paid_reference}
 *                        wants and what an organiser will quote back
 * @param payerName       the sending account's name, shown so the admin can see
 *                        at a glance that the screenshot is the right transfer
 */
public record ExtractedReceiptResponse(

        @JsonProperty("amount") String amount,

        @JsonProperty("date") String date,

        @JsonProperty("reference_number") String referenceNumber,

        @JsonProperty("payer_name") String payerName) {
}
