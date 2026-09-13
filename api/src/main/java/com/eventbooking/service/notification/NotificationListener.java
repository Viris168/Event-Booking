package com.eventbooking.service.notification;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.model.Booking;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.OrganizerApplication;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerApplicationRepository;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.service.notification.telegram.TelegramNotifier;
import com.eventbooking.repository.OrganizerProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Turns things that happened into things people are told.
 *
 * <p>Every handler is {@code AFTER_COMMIT}. That is the load-bearing decision
 * here: a notification is a statement that something is true, so it must not be
 * written until the thing is actually true and durable. Inside the transaction,
 * a payment that settled and then failed to save would still have announced
 * itself, and the customer would be holding a "confirmed" they cannot use.
 * After the commit there is no such window - and equally, nothing this class
 * does can roll the payment back, because the payment is already finished.
 *
 * <p>{@code REQUIRES_NEW} on each handler exists so the entity loads below have
 * a session to be lazy in. Without it the repository call returns a detached
 * row and the first {@code booking.getEvent()} throws, after the commit, where
 * nobody is looking.
 */
@Component
public class NotificationListener {

    private static final Logger log = LoggerFactory.getLogger(NotificationListener.class);

    private final NotificationService notificationService;
    private final BookingRepository bookingRepository;
    private final EventRepository eventRepository;
    private final OrganizerApplicationRepository organizerApplicationRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final AppUserRepository appUserRepository;
    private final TelegramNotifier telegram;

    public NotificationListener(NotificationService notificationService,
                                BookingRepository bookingRepository,
                                EventRepository eventRepository,
                                OrganizerApplicationRepository organizerApplicationRepository,
                                OrganizerProfileRepository organizerProfileRepository,
                                AppUserRepository appUserRepository,
                                TelegramNotifier telegram) {
        this.notificationService = notificationService;
        this.bookingRepository = bookingRepository;
        this.eventRepository = eventRepository;
        this.organizerApplicationRepository = organizerApplicationRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.appUserRepository = appUserRepository;
        this.telegram = telegram;
    }

    /**
     * The organisation behind an event, for a message a person reads.
     *
     * <p>Falls back to the owner's own name, and then to nothing: a Telegram
     * nudge naming no organiser is still worth sending, where one that threw
     * because a profile row was missing would lose the notification entirely.
     */
    private String organizerName(Long organizerProfileId) {
        return organizerProfileRepository.findById(organizerProfileId)
                .map(profile -> {
                    String org = profile.getOrgNameEn();
                    if (org != null && !org.isBlank()) return org;
                    return appUserRepository.findById(profile.getUserId())
                            .map(AppUser::getDisplayName)
                            .orElse("");
                })
                .orElse("");
    }

    /**
     * The organiser's {@code app_user.id}, from the id an event actually holds.
     *
     * <p>{@code event.organizer_id} references {@code organizer_profile(id)},
     * not {@code app_user(id)} - the two are different sequences over different
     * tables. Addressing a notification with the profile id would deliver it to
     * whichever unrelated person happens to hold that number in app_user, which
     * is worse than not delivering it at all: an organiser's rejection notice
     * would land in a stranger's inbox.
     *
     * @return null if the profile is gone, which the writer treats as nobody to tell
     */
    private Long organizerUserId(Long organizerProfileId) {
        return organizerProfileRepository.findById(organizerProfileId)
                .map(profile -> profile.getUserId())
                .orElseGet(() -> {
                    log.warn("Event names organizer_profile {} which no longer exists", organizerProfileId);
                    return null;
                });
    }

    // ------------------------------------------------------------------ bookings

    /**
     * The customer's side of a booking, and the organiser's.
     *
     * <p>Only the states worth an interruption are handled. PENDING_PAYMENT and
     * AWAITING_CONFIRMATION are deliberately silent: the customer is looking at
     * the checkout screen when those happen, and telling somebody what they are
     * currently watching is how a notification bell becomes noise people stop
     * reading.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onBookingStateChanged(NotificationEvents.BookingStateChanged e) {
        NotificationType customerType = switch (e.to()) {
            // Arriving at CONFIRMED from REFUND_REQUESTED is a refused refund,
            // not a completed purchase. Same destination, opposite news.
            case CONFIRMED -> e.from() == BookingStatus.REFUND_REQUESTED
                    ? NotificationType.BOOKING_REFUND_DECLINED
                    : NotificationType.BOOKING_CONFIRMED;
            case PAYMENT_FAILED -> NotificationType.BOOKING_PAYMENT_FAILED;
            case CANCELLED -> NotificationType.BOOKING_CANCELLED;
            case EXPIRED -> NotificationType.BOOKING_EXPIRED;
            case REFUNDED -> NotificationType.BOOKING_REFUNDED;
            default -> null;
        };

        boolean tellAdmins = e.to() == BookingStatus.REFUND_REQUESTED;

        if (customerType == null && !tellAdmins) {
            return;
        }

        Booking booking = bookingRepository.findById(e.bookingId()).orElse(null);
        if (booking == null) {
            log.warn("Booking {} vanished between commit and notification", e.bookingId());
            return;
        }

        Event event = booking.getEvent();
        Map<String, Object> params = new HashMap<>();
        params.put("bookingRef", booking.getBookingRef());
        params.put("titleEn", event.getTitleEn());
        params.put("titleKm", event.getTitleKm());
        params.put("totalUsdCents", booking.getTotalUsdCents());

        if (customerType != null) {
            notificationService.notifyUser(
                    booking.getUserId(),
                    customerType,
                    booking.getBookingRef(),
                    "/bookings/" + booking.getId(),
                    params);
        }

        // A sale is the organiser's news too, and it is the only notification
        // they get that is not about moderation. Same dedupe key as the
        // customer's: the key is scoped per recipient and per type, so the two
        // rows do not collide.
        //
        // Excluding the refused-refund path explicitly rather than leaving the
        // dedupe key to absorb it. It would - the ref is the same - but that
        // makes "the organiser is not told twice about one sale" a property of
        // the write guard instead of a decision anybody made.
        if (e.to() == BookingStatus.CONFIRMED && e.from() != BookingStatus.REFUND_REQUESTED) {
            notificationService.notifyUser(
                    organizerUserId(event.getOrganizerId()),
                    NotificationType.EVENT_TICKETS_SOLD,
                    booking.getBookingRef(),
                    "/organizer/events/" + event.getId() + "/sales",
                    params);
        }

        if (tellAdmins) {
            notificationService.notifyAdmins(
                    NotificationType.REFUND_REQUESTED,
                    booking.getBookingRef(),
                    "/admin/payments",
                    params);
        }
    }

    // -------------------------------------------------------------------- events

    /**
     * Review decisions, in both directions.
     *
     * <p>SUBMIT goes to the admins because it is the only thing that puts work in
     * their queue. WITHDRAW and PUBLISH notify nobody: both are the organiser's
     * own action on their own event, and telling someone what they just did is
     * the clearest way to teach them to ignore the bell.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onEventReviewed(NotificationEvents.EventReviewed e) {
        NotificationType organizerType = switch (e.transition()) {
            case APPROVE -> NotificationType.EVENT_APPROVED;
            case REJECT -> NotificationType.EVENT_REJECTED;
            case REQUEST_CHANGES -> NotificationType.EVENT_CHANGES_REQUESTED;
            case TAKE_DOWN -> NotificationType.EVENT_TAKEN_DOWN;
            case RESTORE -> NotificationType.EVENT_RESTORED;
            default -> null;
        };

        boolean tellAdmins = e.transition() == EventTransition.SUBMIT;

        if (organizerType == null && !tellAdmins) {
            return;
        }

        Event event = eventRepository.findById(e.eventId()).orElse(null);
        if (event == null) {
            log.warn("Event {} vanished between commit and notification", e.eventId());
            return;
        }

        Map<String, Object> params = new HashMap<>();
        params.put("titleEn", event.getTitleEn());
        params.put("titleKm", event.getTitleKm());
        // Null for APPROVE and SUBMIT, which need no explanation. The client
        // renders the reason line only when there is one.
        params.put("message", e.message());

        /*
         * The review row is the occurrence. Keying on the event and its status
         * instead would collapse a rejection, a resubmit and a second rejection
         * into one row: the status reads REJECTED both times, so the second
         * refusal would be deduplicated away and the organiser would sit waiting
         * for a decision that had already been made.
         *
         * TAKE_DOWN and RESTORE write no review row, and since RESTORE exists
         * they are both repeatable: an event can be pulled, put back, and
         * pulled again. The old key here was eventId + transition, which was
         * true only while take-down was terminal - the moment it stopped being,
         * that key silently swallowed every take-down after the first and the
         * organiser's event left the catalogue with no notification at all.
         *
         * So those two are keyed per occurrence. Dedupe exists to absorb a
         * listener running twice over one event, and this listener fires
         * AFTER_COMMIT on a transition that has already been applied - so there
         * is exactly one firing to key, and each genuinely is a new occurrence.
         */
        String key = e.reviewId() != null
                ? "review:" + e.reviewId()
                : event.getId() + ":" + e.transition() + ":" + Instant.now().toEpochMilli();

        if (organizerType != null) {
            notificationService.notifyUser(
                    organizerUserId(event.getOrganizerId()),
                    organizerType,
                    key,
                    "/organizer/events/" + event.getId() + "/edit",
                    params);
        }

        if (tellAdmins) {
            params.put("eventId", event.getId());
            notificationService.notifyAdmins(
                    NotificationType.EVENT_SUBMITTED_FOR_REVIEW,
                    key,
                    "/admin/review",
                    params);

            /*
             * The other thing that waits on a human: an event in the review
             * queue cannot go on sale until somebody decides it, and until then
             * the organiser is blocked.
             *
             * Only on SUBMIT. The other transitions here are decisions an admin
             * has just made themselves, and messaging a group to report what one
             * of its own members did a second ago is how a channel gets muted.
             */
            StringBuilder msg = new StringBuilder()
                    .append("<b>Event waiting for review</b>\n\n")
                    .append("<b>").append(TelegramNotifier.escape(event.getTitleEn())).append("</b>\n")
                    .append(TelegramNotifier.escape(organizerName(event.getOrganizerId()))).append('\n');

            if (event.getVenue() != null) {
                msg.append(TelegramNotifier.escape(event.getVenue().getNameEn())).append('\n');
            }
            msg.append("\nDecide it in the admin review queue.");

            telegram.send(msg.toString());
        }
    }

    // -------------------------------------------------- organizer applications

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrganizerApplicationSubmitted(NotificationEvents.OrganizerApplicationSubmitted e) {
        OrganizerApplication application = organizerApplicationRepository.findById(e.applicationId()).orElse(null);
        if (application == null) {
            log.warn("Organizer application {} vanished between commit and notification", e.applicationId());
            return;
        }

        notificationService.notifyAdmins(
                NotificationType.ORGANIZER_APPLICATION_SUBMITTED,
                String.valueOf(application.getId()),
                "/admin/applications",
                Map.of(
                        "orgNameEn", application.getOrgNameEn(),
                        "orgNameKm", application.getOrgNameKm()));

        /*
         * The same news, to a phone.
         *
         * An organiser application sits in the queue until a human decides it,
         * and the in-app bell only reaches somebody already looking at the admin
         * console. This is the nudge that gets them there.
         *
         * After the in-app notification, never instead of it: notifyAdmins has
         * written the durable record by this point, so a Telegram outage costs
         * the nudge and nothing else. TelegramNotifier swallows its own failures
         * for the same reason - see its class comment.
         */
        String applicant = appUserRepository.findById(application.getUserId())
                .map(AppUser::getDisplayName)
                .orElse("Someone");

        StringBuilder msg = new StringBuilder()
                .append("<b>New organiser application</b>\n\n")
                .append(TelegramNotifier.escape(applicant))
                .append(" wants to run events as <b>")
                .append(TelegramNotifier.escape(application.getOrgNameEn()))
                .append("</b>.\n");

        if (application.getTelegramHandle() != null && !application.getTelegramHandle().isBlank()) {
            msg.append("Telegram: ").append(TelegramNotifier.escape(application.getTelegramHandle())).append('\n');
        }
        if (application.getMessage() != null && !application.getMessage().isBlank()) {
            msg.append('\n').append("<i>").append(TelegramNotifier.escape(application.getMessage())).append("</i>\n");
        }
        msg.append("\nDecide it under Organiser applications in the admin console.");

        telegram.send(msg.toString());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrganizerApplicationDecided(NotificationEvents.OrganizerApplicationDecided e) {
        OrganizerApplication application = organizerApplicationRepository.findById(e.applicationId()).orElse(null);
        if (application == null) {
            log.warn("Organizer application {} vanished between commit and notification", e.applicationId());
            return;
        }

        boolean approved = e.decision() == OrganizerApplicationStatus.APPROVED;

        Map<String, Object> params = new HashMap<>();
        params.put("orgNameEn", application.getOrgNameEn());
        params.put("orgNameKm", application.getOrgNameKm());
        // The reason is required by a DB CHECK on rejection, and it is the part
        // the applicant is owed - a refusal they cannot act on is worse than none.
        params.put("note", application.getAdminNote());

        notificationService.notifyUser(
                application.getUserId(),
                approved
                        ? NotificationType.ORGANIZER_APPLICATION_APPROVED
                        : NotificationType.ORGANIZER_APPLICATION_REJECTED,
                String.valueOf(application.getId()),
                // A rejected applicant is sent back to the form rather than to an
                // organiser area they cannot open.
                approved ? "/organizer" : "/become-an-organizer",
                params);
    }
}
