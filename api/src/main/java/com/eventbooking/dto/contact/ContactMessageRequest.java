package com.eventbooking.dto.contact;

import com.eventbooking.Enumeration.ContactTopic;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * What the public contact form sends.
 *
 * <p>This is the one request body in the application that arrives with no
 * bearer token behind it, so it is the one where every field is genuinely
 * attacker-chosen rather than merely user-supplied. The size caps below are not
 * cosmetic: without them {@code body} is an unbounded TEXT column reachable by
 * anyone, which is a way to fill a disk rather than a way to ask a question.
 *
 * <p>No sender id, and not because the caller cannot be trusted to supply one -
 * usually there is no id to supply. Where the sender does happen to be signed
 * in, the controller reads it from the principal, the same rule every other
 * write follows.
 */
public record ContactMessageRequest(

        /**
         * Their name as they give it, which is not necessarily their account's.
         * 200 to match {@code organizer_application.org_name_en}'s cap; nobody
         * needs more and the column is what the admin inbox renders in a cell.
         */
        @NotBlank
        @Size(max = 200)
        String senderName,

        /**
         * Where the reply goes. Required: a message that cannot be answered
         * costs the reader their time and gives the sender nothing.
         *
         * <p>{@code @Email} is shape-checking only, and deliberately so - no
         * pattern decides whether an address is real, only whether a reply
         * arrives. The DB CHECK in V33 repeats it because seed scripts and psql
         * sessions never reach this class.
         */
        @NotBlank
        @Email
        @Size(max = 320)
        String replyTo,

        /**
         * Optional second channel. Accepted as {@code @sokha}, {@code sokha},
         * {@code t.me/sokha} or the full URL - the service strips all of that
         * before storing, exactly as AuthService does for
         * {@code app_user.telegram_username}.
         *
         * <p>So this cap is on what someone may TYPE, not on what is stored.
         * The 5-32 bare-handle rule is enforced after normalisation, where it
         * can be applied to the actual handle rather than to its decoration.
         */
        @Size(max = 100)
        String telegramUsername,

        /** Routing. Required, because "unfiled" is what {@code OTHER} is for. */
        @NotNull
        ContactTopic topic,

        @NotBlank
        @Size(max = 200)
        String subject,

        /**
         * The message. 5000 is roughly two pages - long enough to explain a
         * payment that went wrong in full detail, short enough that the column
         * is not an upload endpoint.
         */
        @NotBlank
        @Size(max = 5000)
        String body,

        /**
         * A booking reference, if the sender has one to hand. Free text and
         * never resolved - see {@link com.eventbooking.model.ContactMessage
         * #getBookingRef()} for why a wrong reference is worth storing as
         * typed.
         *
         * <p>The pattern refuses only the obviously-not-a-reference: it is a
         * short token, and anything with whitespace or markup in it is a
         * sentence that belongs in {@code body}.
         */
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9_-]*$",
                message = "A booking reference is letters, digits, dashes and underscores")
        String bookingRef
) {
}
