package com.eventbooking.dto.payout;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The admin recording that money actually left.
 *
 * <p>{@code reference} is mandatory, and {@code @Valid} on the controller is
 * what makes that a readable 400 rather than a raw constraint violation from
 * {@code payout_request_paid_consistent}. Requiring it is the point of having a
 * separate PAID state at all: without a reference, "paid" is a claim nobody can
 * check, and the first time an organiser says the money never arrived there is
 * nothing to look up.
 */
public record MarkPaidRequest(

        @NotBlank(message = "reference is required")
        @Size(max = 120)
        String reference,

        /** Anything the admin wants on the record - "sent via ABA app, fee waived". */
        @Size(max = 1000)
        String note
) {
}
