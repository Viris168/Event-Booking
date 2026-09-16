package com.eventbooking.dto.booking;

/**
 * The two numbers over the organiser's transactions table.
 *
 * <p>Separate from the page of rows on purpose. A {@code Page} carries its own
 * totalElements, but the money does not fit in one - and the screen needs both
 * to describe the same filtered set, not the same twenty-five rows.
 */
public record OrganizerTransactionSummaryResponse(
        /** Transactions matching the current filters, not the current page. */
        long count,

        /**
         * What actually landed, in USD cents: CONFIRMED bookings only.
         *
         * <p>The same definition the payout invoice and the dashboard use. A
         * pending booking is an intention that lapses when its hold expires,
         * and a "settled" figure that folded those in would promise an
         * organiser money that can still evaporate.
         */
        long settledUsdCents
) {
}
