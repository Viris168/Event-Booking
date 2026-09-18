package com.eventbooking.service.contact;

import com.eventbooking.Enumeration.ContactMessageStatus;
import com.eventbooking.dto.contact.ContactInboxPage;
import com.eventbooking.dto.contact.ContactMessageReceipt;
import com.eventbooking.dto.contact.ContactMessageRequest;
import com.eventbooking.dto.contact.ContactMessageResponse;
import com.eventbooking.dto.contact.HandleContactMessageRequest;

/**
 * The public contact form, and the admin inbox it fills.
 *
 * <p>Two audiences with almost nothing in common - one is anonymous and writes
 * once, the other is a platform admin and only reads - which is why the
 * controllers are split. They share a service because they share one table and
 * one set of rules about it, and splitting the service as well would mean two
 * classes agreeing by hand on what a status transition means.
 */
public interface ContactService {

    /**
     * File a message from the contact form.
     *
     * @param senderUserId the sender's {@code app_user.id}, or null. Read from
     *        the principal when there happens to be one; never from the body.
     *        Null is the ordinary case and is not an error.
     * @param address      the caller's network address, for the abuse limit. Not
     *        stored - see V33, which has no column for it.
     */
    ContactMessageReceipt submit(Long senderUserId, String address, ContactMessageRequest request);

    /**
     * One page of the inbox, plus the counts for every status tab.
     *
     * @param status null for "every status", which is the view an admin gets
     *        when they go looking for something they answered last week
     */
    ContactInboxPage inbox(Long actorUserId, ContactMessageStatus status, int page, int size);

    /**
     * Move a message along, recording which admin did it and when.
     *
     * <p>Refuses a move to {@link ContactMessageStatus#NEW}: that status means
     * "nobody has looked at this", and the request is itself somebody looking.
     */
    ContactMessageResponse handle(Long actorUserId, Long messageId, HandleContactMessageRequest request);
}
