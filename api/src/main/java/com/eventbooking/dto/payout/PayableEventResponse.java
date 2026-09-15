package com.eventbooking.dto.payout;

import java.time.Instant;

/**
 * A finished event with money against it and no payout yet - one card on the
 * organiser's "request a payout" screen.
 *
 * <p>Deliberately not {@link PayoutRequestResponse} with null fields. This is a
 * quote, not an invoice: the numbers are computed live and will keep moving
 * until somebody clicks, whereas every number on a PayoutRequestResponse was
 * frozen the moment the request was made. Sharing one record between the two
 * would erase exactly the distinction that makes the snapshot worth storing.
 *
 * <p>Which is why the fee is quoted here too. An organiser deciding whether to
 * claim $1,200 should be told they will receive $1,080 before they agree to it,
 * not after - and recomputing it in the browser would put the commission
 * formula in two places, free to disagree.
 */
public record PayableEventResponse(

        Long eventId,
        String titleEn,
        String titleKm,
        Instant startsAt,

        /** Live totals. True when this was read, not promises. */
        long grossUsdCents,
        int feeBps,
        long feeUsdCents,

        /** What a request made right now would be worth. */
        long netUsdCents,

        int ticketsSold,
        int bookingsCount
) {
}
