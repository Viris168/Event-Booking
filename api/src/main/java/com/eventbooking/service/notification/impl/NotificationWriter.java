package com.eventbooking.service.notification.impl;

import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.model.Notification;
import com.eventbooking.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Writes exactly one notification row, in a transaction of its very own.
 *
 * <p>A separate bean rather than a method on {@code NotificationServiceimpl},
 * and the reason is the admin fan-out. {@code notifyAdmins} writes one row per
 * admin; if it called a {@code REQUIRES_NEW} method on itself, the call would go
 * through {@code this} instead of the proxy, every insert would land in one
 * shared transaction, and the first duplicate would mark that transaction
 * rollback-only - so a constraint violation for admin #1 would take out the
 * notifications for admins #2 through #6, none of whom had anything wrong with
 * theirs. Crossing a bean boundary is what makes "its own transaction" true
 * rather than merely annotated.
 *
 * <p>Never throws. Its callers are things that have already happened.
 */
@Component
class NotificationWriter {

    private static final Logger log = LoggerFactory.getLogger(NotificationWriter.class);

    private final NotificationRepository notificationRepository;

    NotificationWriter(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    /**
     * {@code REQUIRES_NEW} because callers arrive from
     * {@code @TransactionalEventListener(AFTER_COMMIT)}: the business transaction
     * is finished, so there is nothing to join, and re-opening one around a
     * settled payment is exactly what must not happen.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void write(Long recipientUserId,
               NotificationType type,
               String dedupeKey,
               String linkUrl,
               Map<String, Object> params) {

        if (recipientUserId == null) {
            // Machine-driven transitions have no actor, and a sweeper expiring an
            // abandoned hold can reach here with nobody to tell. Not an error.
            return;
        }

        try {
            // The unique index is the guarantee; this is what keeps the ordinary
            // path from reaching it. The PayWay poller re-reads a settled
            // transaction until it stops changing, so without this check the
            // normal case after the first poll would be a constraint violation -
            // harmless, but it fills the log with errors that look like bugs.
            if (notificationRepository.existsByRecipientUserIdAndTypeAndDedupeKey(
                    recipientUserId, type, dedupeKey)) {
                return;
            }

            notificationRepository.save(Notification.builder()
                    .recipientUserId(recipientUserId)
                    .type(type)
                    .params(params == null ? Map.of() : params)
                    .linkUrl(linkUrl)
                    .dedupeKey(dedupeKey)
                    .build());

        } catch (DataIntegrityViolationException e) {
            // The check above lost a race and the index caught what it is for.
            // The result is the one that was wanted: exactly one row.
            log.debug("Notification {} already present for user {} (key={})",
                    type, recipientUserId, dedupeKey);

        } catch (RuntimeException e) {
            // The rule this class exists to keep: a booking is not un-confirmed
            // because its notification could not be written. Logged at error
            // because a silently empty inbox is a real defect - just not one the
            // caller can do anything about.
            log.error("Could not write {} notification for user {} (key={})",
                    type, recipientUserId, dedupeKey, e);
        }
    }
}
