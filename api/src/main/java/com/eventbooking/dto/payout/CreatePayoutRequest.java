package com.eventbooking.dto.payout;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * What the organiser fills in to claim a finished event.
 *
 * <p>Notably absent: any amount. The organiser names the event and where to
 * send the money; the server works out what it is worth. Letting a request
 * state its own total would mean either trusting it - which is a form anybody
 * can type a million dollars into - or computing the real figure anyway and
 * rejecting the mismatch, which is the same work plus an error message.
 *
 * <p>Also absent: an organizer id. The scope comes from the bearer token, so
 * claiming somebody else's event is unrepresentable rather than merely refused
 * - the same rule {@code CreateEventRequest} adopted.
 */
public record CreatePayoutRequest(

        @NotNull(message = "eventId is required")
        Long eventId,

        /*
         * Held to the same five values as the DB CHECK. Duplicated rather than
         * shared with a Java enum because the set is a deployment's business
         * (a new bank is one migration) and because @Pattern gives the
         * organiser "must be one of..." where an enum parse failure gives them
         * a Jackson deserialization error.
         */
        @NotBlank(message = "payoutMethod is required")
        @Pattern(regexp = "ABA|ACLEDA|WING|CANADIA|OTHER",
                 message = "payoutMethod must be one of ABA, ACLEDA, WING, CANADIA, OTHER")
        String payoutMethod,

        @NotBlank(message = "accountName is required")
        @Size(max = 120)
        String accountName,

        /*
         * Loose on purpose. Five banks with five formats, plus OTHER, and an
         * organiser locked out by a regex that did not anticipate their account
         * cannot be paid at all. The admin reads this before transferring, so a
         * typo is caught by a human who was going to look anyway.
         */
        @NotBlank(message = "accountNumber is required")
        @Size(max = 64)
        String accountNumber,

        @Size(max = 1000)
        String note
) {
}
