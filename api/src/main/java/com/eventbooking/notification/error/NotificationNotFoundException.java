package com.eventbooking.notification.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Raised when the caller names a notification that is not in their inbox.
 *
 * <p>Deliberately does not distinguish "no such row" from "somebody else's row".
 * Both are 404, and the message names only the id the caller already sent. A
 * 403 here would confirm that the id exists and belongs to someone, which is
 * more than a stranger should be able to learn by incrementing a number.
 */
public class NotificationNotFoundException extends ApiException {
    public NotificationNotFoundException(Long notificationId) {
        super(ErrorCode.RESOURCE_NOT_FOUND, "Notification not found with ID: " + notificationId);
    }
}
