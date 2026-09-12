package com.eventbooking.service.notification.impl;

import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.notification.NotificationResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Notification;
import com.eventbooking.notification.error.NotificationNotFoundException;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.NotificationRepository;
import com.eventbooking.service.notification.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class NotificationServiceimpl implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationServiceimpl.class);

    /**
     * An inbox request cannot ask for the whole table. Without a ceiling,
     * {@code ?size=100000} is a scan of every notification a busy admin has ever
     * received, served to whoever typed the URL.
     */
    private static final int MAX_PAGE_SIZE = 100;

    private final NotificationRepository notificationRepository;
    private final AppUserRepository appUserRepository;
    private final NotificationWriter writer;

    public NotificationServiceimpl(NotificationRepository notificationRepository,
                                   AppUserRepository appUserRepository,
                                   NotificationWriter writer) {
        this.notificationRepository = notificationRepository;
        this.appUserRepository = appUserRepository;
        this.writer = writer;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<NotificationResponse> inbox(Long recipientUserId, boolean unreadOnly, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.clamp(size, 1, MAX_PAGE_SIZE));

        Page<Notification> rows = unreadOnly
                ? notificationRepository.findByRecipientUserIdAndReadAtIsNullOrderByCreatedAtDesc(
                        recipientUserId, pageable)
                : notificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(recipientUserId, pageable);

        return rows.map(NotificationResponse::from);
    }

    @Override
    @Transactional(readOnly = true)
    public long unreadCount(Long recipientUserId) {
        return notificationRepository.countByRecipientUserIdAndReadAtIsNull(recipientUserId);
    }

    @Override
    @Transactional
    public NotificationResponse markRead(Long recipientUserId, Long notificationId) {
        Notification notification = notificationRepository
                .findByIdAndRecipientUserId(notificationId, recipientUserId)
                .orElseThrow(() -> new NotificationNotFoundException(notificationId));

        // Marking a read notification read is not an error: the client fires this
        // on click, and clicking twice is not a mistake worth a 409. Keeping the
        // first timestamp is what makes "when did you see this" stay true.
        if (notification.getReadAt() == null) {
            notification.setReadAt(Instant.now());
        }

        return NotificationResponse.from(notification);
    }

    @Override
    @Transactional
    public int markAllRead(Long recipientUserId) {
        return notificationRepository.markAllRead(recipientUserId, Instant.now());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Not {@code @Transactional} itself: the row write owns its transaction,
     * in {@link NotificationWriter}, for the reason documented there.
     */
    @Override
    public void notifyUser(Long recipientUserId,
                           NotificationType type,
                           String dedupeKey,
                           String linkUrl,
                           Map<String, Object> params) {
        writer.write(recipientUserId, type, dedupeKey, linkUrl, params);
    }

    @Override
    public void notifyAdmins(NotificationType type,
                             String dedupeKey,
                             String linkUrl,
                             Map<String, Object> params) {
        try {
            List<AppUser> admins = appUserRepository.findAllByRoleOrderByIdAsc(Role.PLATFORM_ADMIN);

            if (admins.isEmpty()) {
                // Worth a line: it means something is sitting in a review queue
                // that nobody has been told about.
                log.warn("No PLATFORM_ADMIN to notify of {} (key={})", type, dedupeKey);
                return;
            }

            // One row per admin, each in its own transaction. An admin reading it
            // does not clear it from anyone else's inbox - the queue is still
            // there for them too until somebody actually works it.
            for (AppUser admin : admins) {
                writer.write(admin.getId(), type, dedupeKey, linkUrl, params);
            }

        } catch (RuntimeException e) {
            log.error("Could not fan out {} notification to admins (key={})", type, dedupeKey, e);
        }
    }
}
