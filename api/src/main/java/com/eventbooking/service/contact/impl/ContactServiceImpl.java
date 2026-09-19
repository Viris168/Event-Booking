package com.eventbooking.service.contact.impl;

import com.eventbooking.Enumeration.ContactMessageStatus;
import com.eventbooking.dto.contact.ContactInboxPage;
import com.eventbooking.dto.contact.ContactMessageReceipt;
import com.eventbooking.dto.contact.ContactMessageRequest;
import com.eventbooking.dto.contact.ContactMessageResponse;
import com.eventbooking.dto.contact.HandleContactMessageRequest;
import com.eventbooking.exception.contact.ContactMessageNotFoundException;
import com.eventbooking.exception.contact.InvalidContactStatusException;
import com.eventbooking.exception.contact.TooManyContactMessagesException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.ContactMessage;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.ContactMessageRepository;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.ContactRateLimiter;
import com.eventbooking.service.contact.ContactService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * @see com.eventbooking.service.contact.ContactService
 */
@Service
@Slf4j
public class ContactServiceImpl implements ContactService {

    /**
     * Telegram's own rule: 5-32 characters of {@code [A-Za-z0-9_]}, checked
     * after the {@code @} and {@code t.me/} decoration has been stripped.
     *
     * <p>The same constant as {@code app_user_telegram_username_check} in V32
     * and the CHECK on {@code contact_message.telegram_username} in V33. Three
     * copies of one rule is not ideal, and the alternative - trusting whichever
     * layer happens to run - is worse: seed scripts never reach this class, and
     * this class runs on values that never reach a form.
     */
    private static final Pattern TELEGRAM_HANDLE = Pattern.compile("^[A-Za-z0-9_]{5,32}$");

    /** Strips {@code https://}, {@code t.me/}, a leading {@code @} and trailing slashes. */
    private static final Pattern TELEGRAM_DECORATION =
            Pattern.compile("^(?:https?://)?(?:t\\.me/|telegram\\.me/)?@?", Pattern.CASE_INSENSITIVE);

    /** The inbox page size an admin may ask for, capped. */
    private static final int MAX_PAGE_SIZE = 100;

    private final ContactMessageRepository contactMessageRepository;
    private final AppUserRepository appUserRepository;
    private final AdminResolver adminResolver;
    private final ContactRateLimiter rateLimiter;

    public ContactServiceImpl(ContactMessageRepository contactMessageRepository,
                              AppUserRepository appUserRepository,
                              AdminResolver adminResolver,
                              ContactRateLimiter rateLimiter) {
        this.contactMessageRepository = contactMessageRepository;
        this.appUserRepository = appUserRepository;
        this.adminResolver = adminResolver;
        this.rateLimiter = rateLimiter;
    }

    /**
     * {@inheritDoc}
     *
     * <p>The order of the three checks below is deliberate. The in-memory limit
     * runs first because it is two map lookups and refuses a flood before it
     * touches the database at all. The database-backed one runs second, for the
     * cases the first cannot see - a restart, or a second replica. The insert
     * is last.
     *
     * <p>{@code senderUserId} is written down but never trusted to describe the
     * sender: {@code senderName} and {@code replyTo} are stored exactly as
     * typed even when an account is attached. Somebody writing in about a
     * relative's booking puts that person's details in the form, and
     * "correcting" them from the session would send the reply to the wrong
     * human being.
     */
    @Override
    @Transactional
    public ContactMessageReceipt submit(Long senderUserId, String address, ContactMessageRequest request) {
        String replyTo = request.replyTo().trim();
        String replyToKey = replyTo.toLowerCase();

        rateLimiter.check(address, replyToKey);
        refuseIfSenderOverQuota(replyToKey);

        ContactMessage saved = contactMessageRepository.save(ContactMessage.builder()
                .userId(senderUserId)
                .senderName(request.senderName().trim())
                .replyTo(replyTo)
                .telegramUsername(normaliseTelegram(request.telegramUsername()))
                .topic(request.topic())
                .subject(request.subject().trim())
                .body(request.body().trim())
                .bookingRef(blankToNull(request.bookingRef()))
                .status(ContactMessageStatus.NEW)
                .build());

        // After the insert, not before: a submission lost to validation or to a
        // constraint never happened as far as the sender is concerned, and
        // charging them for it would make a typo cost part of their allowance.
        rateLimiter.recordAccepted(address, replyToKey);

        /*
         * The sender's own address is NOT logged, and neither is anything else
         * they wrote. This line exists so an operator can see the form is being
         * used and at what rate; everything beyond that is in the table, behind
         * the admin screen, where it is subject to whatever retention the
         * platform decides. Logs are the one place that decision does not
         * reach.
         */
        log.info("Contact message {} received, topic {}", saved.getId(), saved.getTopic());

        return new ContactMessageReceipt(saved.getId(), saved.getReceivedAt());
    }

    @Override
    @Transactional(readOnly = true)
    public ContactInboxPage inbox(Long actorUserId, ContactMessageStatus status, int page, int size) {
        adminResolver.requireAdminUserId(actorUserId);

        Pageable pageable = PageRequest.of(Math.max(0, page), clampSize(size));
        Page<ContactMessage> found = status == null
                ? contactMessageRepository.findAllByOrderByReceivedAtDesc(pageable)
                : contactMessageRepository.findByStatusOrderByReceivedAtDesc(status, pageable);

        /*
         * Every app_user id this page names, resolved in one query rather than
         * one per row. Two ids per message (the sender, and the admin who
         * handled it), so a 100-row page is up to 200 lookups done as one.
         */
        Map<Long, String> names = resolveNames(found.getContent());

        List<ContactMessageResponse> items = found.getContent().stream()
                .map(m -> toResponse(m, names))
                .toList();

        return new ContactInboxPage(
                items,
                found.getNumber(),
                found.getSize(),
                found.getTotalElements(),
                found.getTotalPages(),
                countsByStatus());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Not guarded against a second admin acting on the same row, unlike
     * {@code OrganizerApplicationAlreadyDecidedException}. That guard exists
     * because approving an application has irreversible side effects - a role
     * granted, a profile row created - and the second admin needs to know the
     * first one already did it. Nothing here has side effects: moving a message
     * from OPEN to CLOSED twice leaves it CLOSED, and the second admin's name
     * on it is not a worse answer than the first's.
     */
    @Override
    @Transactional
    public ContactMessageResponse handle(Long actorUserId, Long messageId, HandleContactMessageRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);

        // NEW is a value, not a destination - see InvalidContactStatusException.
        if (request.status() == ContactMessageStatus.NEW) {
            throw new InvalidContactStatusException();
        }

        ContactMessage message = contactMessageRepository.findById(messageId)
                .orElseThrow(() -> new ContactMessageNotFoundException(messageId));

        message.setStatus(request.status());
        message.setAdminNote(blankToNull(request.adminNote()));
        // Both, together, every time: contact_message_handled_consistent
        // requires them to agree, and re-stamping on each move is what keeps
        // "handled_at" meaning the last time somebody touched it.
        message.setHandledBy(adminUserId);
        message.setHandledAt(Instant.now());

        ContactMessage saved = contactMessageRepository.save(message);
        return toResponse(saved, resolveNames(List.of(saved)));
    }

    // ------------------------------------------------------------------ helpers

    /**
     * The half of the sender limit that survives a restart.
     *
     * <p>{@link ContactRateLimiter} keeps its counters in memory, so a deploy
     * hands everybody a fresh allowance. For the address key that is accepted -
     * the schema stores no IP to count against, deliberately. For the reply-to
     * it is not, because the column is right there.
     */
    private void refuseIfSenderOverQuota(String replyToKey) {
        Instant since = Instant.now().minus(rateLimiter.senderWindow());
        long recent = contactMessageRepository.countRecentByReplyTo(replyToKey, since);
        if (recent >= rateLimiter.senderLimit()) {
            throw new TooManyContactMessagesException(rateLimiter.senderRetryAfterSeconds(replyToKey));
        }
    }

    /**
     * "@sokha", "sokha", "t.me/sokha" and "https://t.me/sokha" all arrive from
     * the same one-line field and all mean the same person. Stored bare, the
     * way V32 stores {@code app_user.telegram_username} and the way
     * {@code web/src/lib/contactLinks.js} expects to read it back.
     *
     * <p>Returns null for anything that is not a handle once stripped, rather
     * than throwing. This field is optional and secondary - {@code replyTo} is
     * the channel that matters and is already required - so a fumbled handle
     * should not cost somebody the message they took the trouble to write.
     */
    private String normaliseTelegram(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String handle = TELEGRAM_DECORATION.matcher(raw.trim()).replaceFirst("")
                .replaceAll("/+$", "");
        return TELEGRAM_HANDLE.matcher(handle).matches() ? handle : null;
    }

    /**
     * Every status to its count, zeros included.
     *
     * <p>The query omits statuses nothing is in; the client renders a fixed row
     * of tabs. Filling the gaps here is what stops every one of those tabs
     * having to test for an absent key.
     */
    private Map<String, Long> countsByStatus() {
        Map<String, Long> counts = new HashMap<>();
        for (ContactMessageStatus status : ContactMessageStatus.values()) {
            counts.put(status.name(), 0L);
        }
        for (Object[] row : contactMessageRepository.countGroupedByStatus()) {
            counts.put(((ContactMessageStatus) row[0]).name(), (Long) row[1]);
        }
        return counts;
    }

    /** Sender and handler ids across a page, resolved to display names in one query. */
    private Map<Long, String> resolveNames(List<ContactMessage> messages) {
        List<Long> ids = messages.stream()
                .flatMap(m -> java.util.stream.Stream.of(m.getUserId(), m.getHandledBy()))
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();

        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> names = new HashMap<>();
        for (AppUser user : appUserRepository.findAllById(ids)) {
            names.put(user.getId(), user.getDisplayName());
        }
        return names;
    }

    private ContactMessageResponse toResponse(ContactMessage m, Map<Long, String> names) {
        return new ContactMessageResponse(
                m.getId(),
                m.getUserId(),
                m.getUserId() == null ? null : names.get(m.getUserId()),
                m.getSenderName(),
                m.getReplyTo(),
                m.getTelegramUsername(),
                m.getTopic(),
                m.getSubject(),
                m.getBody(),
                m.getBookingRef(),
                m.getStatus(),
                m.getAdminNote(),
                m.getHandledBy(),
                m.getHandledBy() == null ? null : names.get(m.getHandledBy()),
                m.getHandledAt(),
                m.getReceivedAt());
    }

    private int clampSize(int size) {
        return size <= 0 ? 20 : Math.min(size, MAX_PAGE_SIZE);
    }

    private String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
