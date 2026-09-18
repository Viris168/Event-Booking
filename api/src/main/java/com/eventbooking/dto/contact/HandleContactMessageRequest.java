package com.eventbooking.dto.contact;

import com.eventbooking.Enumeration.ContactMessageStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * An admin moving a message along: the new status, and optionally why.
 *
 * <p>The admin is not in the body - it comes from the principal, the same rule
 * the rest of the application follows. {@code handledAt} is not in the body
 * either, for a sharper reason: it is the server's clock, and a client that can
 * state when something was handled can state that it was handled before it
 * arrived.
 *
 * <p>Unlike {@link com.eventbooking.dto.organizer.RejectApplicationRequest},
 * the note is optional in every case. A rejection owes the applicant a reason
 * because they will read it; nothing here is ever shown to the sender, so an
 * empty note costs them nothing and forcing one would only produce a column
 * full of the word "done".
 */
public record HandleContactMessageRequest(

        /**
         * Where the message is going. {@link ContactMessageStatus#NEW} is
         * refused - the service treats it as a value, not a destination, since
         * NEW means "untouched" and this request is itself a touch.
         */
        @NotNull
        ContactMessageStatus status,

        @Size(max = 2000)
        String adminNote
) {
}
