package com.eventbooking.dto.contact;

import com.eventbooking.Enumeration.ContactMessageStatus;
import com.eventbooking.Enumeration.ContactTopic;

import java.time.Instant;

/**
 * One message, as an admin reads it in the inbox.
 *
 * <p><b>Admins only.</b> Unlike {@link com.eventbooking.dto.organizer
 * .OrganizerApplicationResponse}, which serves the applicant and the reviewer
 * from one record, nothing hands this back to the person who sent it. There is
 * nowhere to hand it TO: the sender is usually anonymous, holds no token, and
 * has no screen to read it on - which is also why the submit endpoint answers
 * {@link ContactMessageReceipt} instead of this.
 *
 * <p>That asymmetry is what lets {@code adminNote} live here. It holds
 * "duplicate of #412" and "phoned instead", and it is safe to carry only
 * because this record is never rendered for the sender.
 */
public record ContactMessageResponse(

        Long id,

        /**
         * app_user.id of the sender, or null - and null is ordinary. Present so
         * the inbox can link a message to an account when there is one, not as
         * a claim that most messages have one.
         */
        Long userId,

        /** The account's own name, when {@link #userId} is set. Null otherwise. */
        String accountName,

        /** As typed on the form, which may differ from {@link #accountName}. */
        String senderName,
        String replyTo,
        String telegramUsername,

        ContactTopic topic,
        String subject,
        String body,

        /** As the sender typed it. May well not resolve to a real booking. */
        String bookingRef,

        ContactMessageStatus status,

        /** Admin-only working note. Never shown to the sender. */
        String adminNote,

        /** app_user.id of the admin who moved it out of NEW. Null while NEW. */
        Long handledBy,
        String handledByName,
        Instant handledAt,

        Instant receivedAt
) {
}
