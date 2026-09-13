package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.Provider;
import com.eventbooking.Enumeration.Role;

import java.time.Instant;
import java.util.List;

/**
 * An account as the admin users screen sees it.
 *
 * <p>{@code passwordHash} and {@code providerSubject} are absent and must stay
 * absent: the first is a credential and the second is Google's identifier for
 * the person, neither of which a moderation screen has any use for. What is
 * here is what the table prints plus the booking history behind its expander.
 *
 * <p>{@code lifetimeSpend} counts CONFIRMED and REFUND_REQUESTED only, matching
 * the arithmetic the screen did for itself while it ran on the mock store. A
 * refund that has been asked for but not yet granted is still money taken.
 */
public record AdminUserResponse(
        Long id,
        String phoneE164,
        String email,
        String displayName,
        Role role,
        boolean disabled,
        Provider provider,
        Instant createdAt,

        /** How many bookings this account has, in any state. */
        int bookingCount,

        /** Sum of CONFIRMED and REFUND_REQUESTED booking totals, in USD cents. */
        long lifetimeSpendUsdCents,

        /** Newest first. Backs the expandable history row. */
        List<AdminBookingSummary> bookings
) {
}
