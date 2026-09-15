package com.eventbooking.dto.payout;

import com.eventbooking.Enumeration.PayoutStatus;

import java.time.Instant;

/**
 * One payout, as both audiences see it: the organiser reading their own
 * history, and the admin working the queue.
 *
 * <p>One record rather than two, for the reason
 * {@link com.eventbooking.dto.organizer.OrganizerApplicationResponse} gives -
 * the fields are the same ones, and the difference is who may see them, which
 * is an authorization question that belongs in the service.
 *
 * <p>This DTO is also what the invoice page renders, which is why the event's
 * own details ride along rather than being fetched separately: an invoice names
 * what it is for, and making the client join an event id back to a title would
 * be a second round trip for a document that has to print in one piece.
 *
 * <p>The account number is <b>masked</b> everywhere except on the organiser's
 * own invoice - see {@code PayoutServiceimpl.toResponse}. An admin working the
 * queue needs to recognise the account, not to read it out, and a bank account
 * number in a list view is the kind of thing that ends up in a screenshot.
 */
public record PayoutRequestResponse(

        Long id,
        String invoiceNo,

        Long eventId,
        String eventTitleEn,
        String eventTitleKm,

        /** When the event happened. The invoice's "period", such as it is. */
        Instant eventStartsAt,

        /** organizer_profile.id - the payee, not an app_user.id. */
        Long organizerId,
        String organizerNameEn,
        String organizerNameKm,

        // ------------------------------------------------------- the money

        long grossUsdCents,
        int feeBps,
        long feeUsdCents,
        long netUsdCents,
        int ticketsSold,
        int bookingsCount,

        // --------------------------------------------------------- payment

        String payoutMethod,
        String accountName,

        /**
         * Masked to the last four digits for every reader but the organiser
         * themselves. Null is not used for the masked form - an admin still
         * needs to see that an account WAS given, and a blank cell reads as
         * missing data rather than as withheld data.
         */
        String accountNumber,

        /** The organiser's note to the reviewer. */
        String note,

        // -------------------------------------------------------- decision

        PayoutStatus status,

        /** Free text the admin may attach when recording the transfer. */
        String adminNote,

        /** app_user.id of the deciding admin. Null exactly while REQUESTED. */
        Long reviewedBy,
        String reviewedByName,
        Instant reviewedAt,

        /** The bank's own reference for the transfer. Present exactly on PAID. */
        String paidReference,
        Instant paidAt,

        Instant requestedAt
) {
}
