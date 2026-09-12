package com.eventbooking.service.notification;

import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.dto.notification.NotificationResponse;
import org.springframework.data.domain.Page;

import java.util.Map;

/**
 * The inbox, from both ends: the domain writes into it, the recipient reads it.
 *
 * <p>The two halves have opposite failure rules, and that asymmetry is the
 * interesting thing about this interface. A read that fails should surface - an
 * inbox that silently renders empty is worse than one that says it broke. A
 * write that fails must not: the caller is a payment settling or an event being
 * approved, and none of those should be undone because a row could not be added
 * to somebody's notification list. The implementations of {@code notifyUser} and
 * {@code notifyAdmins} therefore swallow and log rather than throw, which is why
 * they return void and cannot be asked whether they worked.
 */
public interface NotificationService {

    /**
     * One person's inbox, newest first.
     *
     * @param unreadOnly what the bell's dropdown asks for; the full page passes false
     */
    Page<NotificationResponse> inbox(Long recipientUserId, boolean unreadOnly, int page, int size);

    /** The badge number. */
    long unreadCount(Long recipientUserId);

    /**
     * Mark one read. Scoped to the caller, so an id belonging to somebody else
     * reports not-found rather than quietly marking their mail read.
     */
    NotificationResponse markRead(Long recipientUserId, Long notificationId);

    /** Mark the whole inbox read. Returns how many rows that touched. */
    int markAllRead(Long recipientUserId);

    /**
     * Write one notification, unless this exact occurrence was already written.
     *
     * <p>Never throws. See the note on the interface.
     *
     * @param dedupeKey what makes this occurrence distinct for this recipient and
     *                  type - a booking ref, an event id. Required, because the
     *                  question "could this be observed twice" has to be answered
     *                  by whoever writes the notification, and for a polled
     *                  payment the answer is yes
     * @param linkUrl   a client-side route, or null when there is nowhere to go
     */
    void notifyUser(Long recipientUserId,
                    NotificationType type,
                    String dedupeKey,
                    String linkUrl,
                    Map<String, Object> params);

    /**
     * The same, addressed to every PLATFORM_ADMIN.
     *
     * <p>No exclusion of the person who caused it: every admin-facing type here
     * is triggered by a customer or an organiser, so there is nobody to exclude.
     * If an admin-triggered admin notification is ever added, that is the moment
     * to give this an actor to skip - not before, since an unused parameter is
     * one more thing a caller can pass wrongly.
     */
    void notifyAdmins(NotificationType type,
                      String dedupeKey,
                      String linkUrl,
                      Map<String, Object> params);
}
