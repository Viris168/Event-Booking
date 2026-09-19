package com.eventbooking.service.event;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.exception.catalog.EventNotFoundException;
import com.eventbooking.exception.catalog.EventPaidOutException;
import com.eventbooking.model.Booking;
import com.eventbooking.model.Event;
import com.eventbooking.model.PayoutRequest;
import com.eventbooking.repository.BookingItemRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.BookingStatusHistoryRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.repository.PayoutRequestRepository;
import com.eventbooking.repository.ScanLogRepository;
import com.eventbooking.repository.TicketRepository;
import com.eventbooking.service.Image.CloudinaryService;
import com.eventbooking.service.notification.NotificationEvents;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Erasing an event that sold tickets.
 *
 * <p>Separate from {@link EventDeletionService} and deliberately not a flag on
 * it. That one refuses the moment anything has been booked, and that refusal is
 * right for everything it is reached by - an organiser tidying up a duplicate,
 * an admin clearing spam. This is the other case, the one the guard has no good
 * answer for: a listing that is illegal and has to come off the platform
 * completely, tickets and all.
 *
 * <p><b>What this cannot do is give anybody their money back.</b> V30 removed
 * the refund path from the product entirely and said why: nothing here can
 * reverse a settled payment, and a cancelled show is repaid out of band by
 * whoever holds the merchant account. So the order of operations below is not
 * incidental. The export comes first, and it goes into the log before a single
 * row is touched, because the moment the delete commits the platform no longer
 * knows who paid for this event. If that record is not somewhere else by then,
 * it does not exist.
 *
 * <p>Take-down remains the right action almost always, and the ordinary delete
 * remains the right one for a listing nobody bought. This is for the case where
 * neither will do.
 */
@Service
@Slf4j
public class EventForceDeletionService {

    private final EventRepository eventRepository;
    private final BookingRepository bookingRepository;
    private final BookingItemRepository bookingItemRepository;
    private final BookingStatusHistoryRepository bookingStatusHistoryRepository;
    private final TicketRepository ticketRepository;
    private final PaymentTransactionRepository paymentTransactionRepository;
    private final PayoutRequestRepository payoutRequestRepository;
    private final HoldRepository holdRepository;
    private final ScanLogRepository scanLogRepository;
    private final CloudinaryService cloudinaryService;
    private final ApplicationEventPublisher events;

    /**
     * Needed for exactly one thing: clearing the persistence context between
     * the bulk deletes and the event's own.
     *
     * <p>A JPQL bulk delete goes straight to the database and does not tell
     * Hibernate about it, so every Booking the export loaded is still sitting
     * in the context as a managed entity pointing at this Event. Removing the
     * Event with those still around fails the flush with "references an unsaved
     * transient instance" - Hibernate checking a relationship whose other end
     * it does not know is already gone.
     */
    @PersistenceContext
    private EntityManager entityManager;

    public EventForceDeletionService(EventRepository eventRepository,
                                     BookingRepository bookingRepository,
                                     BookingItemRepository bookingItemRepository,
                                     BookingStatusHistoryRepository bookingStatusHistoryRepository,
                                     TicketRepository ticketRepository,
                                     PaymentTransactionRepository paymentTransactionRepository,
                                     PayoutRequestRepository payoutRequestRepository,
                                     HoldRepository holdRepository,
                                     ScanLogRepository scanLogRepository,
                                     CloudinaryService cloudinaryService,
                                     ApplicationEventPublisher events) {
        this.eventRepository = eventRepository;
        this.bookingRepository = bookingRepository;
        this.bookingItemRepository = bookingItemRepository;
        this.bookingStatusHistoryRepository = bookingStatusHistoryRepository;
        this.ticketRepository = ticketRepository;
        this.paymentTransactionRepository = paymentTransactionRepository;
        this.payoutRequestRepository = payoutRequestRepository;
        this.holdRepository = holdRepository;
        this.scanLogRepository = scanLogRepository;
        this.cloudinaryService = cloudinaryService;
        this.events = events;
    }

    /** The CSV and the name to save it under. */
    public record Export(String filename, String csv) {
    }

    /**
     * The sales record, for the admin to download before deciding.
     *
     * <p>Its own endpoint rather than only a side effect of the delete, because
     * the admin needs it <em>before</em> they commit to anything: it is how they
     * see how many people are affected and get the phone numbers to warn them.
     * The force delete writes the same CSV again at the moment of deletion, so
     * a stale download cannot become the only copy.
     */
    @Transactional(readOnly = true)
    public Export export(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        return new Export(filename(event), renderExport(event));
    }

    /**
     * Erase the event, its bookings, its tickets and its payment records.
     *
     * <p>One transaction, and it has to be one. The bookings and the payment
     * transactions cannot be separated: {@code
     * uq_payment_txn_one_success_per_booking} is the only thing stopping a
     * booking being paid twice, and it lives on the payment rows. Dropping
     * those while the bookings survived would leave a booking a replayed
     * provider callback could pay again.
     *
     * <p>Refused for one thing only, and it is not the bookings: an event with
     * a PAID payout. That invoice records money that has already left the
     * platform to the organiser, and it is not the admin's to make disappear -
     * the organiser's accounts and the platform's would stop agreeing, with no
     * record left of why. Take the event down instead and settle the payout
     * question first.
     *
     * @param reason why this listing had to go. Required, unused by any code
     *               path, and written to the log beside the export: this is the
     *               only action on the platform that destroys paid bookings,
     *               and "an admin deleted it" is not an adequate answer to
     *               anyone who asks later what happened to their ticket.
     */
    @Transactional
    public void forceDelete(Long adminUserId, Long eventId, String reason) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        Optional<PayoutRequest> paidOut = payoutRequestRepository.findFirstByEventId(eventId)
                .filter(p -> p.getStatus() == PayoutStatus.PAID);
        if (paidOut.isPresent()) {
            throw new EventPaidOutException(eventId, paidOut.get().getInvoiceNo());
        }

        List<Booking> bookings = bookingRepository.findByEvent_IdOrderByCreatedAtAsc(eventId);

        /*
         * Before anything is destroyed, and to the log rather than to the
         * response. The admin's own download can fail mid-transfer, be saved to
         * a laptop that dies, or simply not have been taken - none of which is
         * knowable from here. The log ships to Loki and is the copy that
         * survives all three.
         *
         * At INFO, not DEBUG: a level somebody might have turned off is not
         * where the last record of who paid for this event belongs.
         */
        log.info("FORCE DELETE of event {} (\"{}\") by admin {}. Reason: {}\nSales record follows:\n{}",
                eventId, event.getTitleEn(), adminUserId, reason, renderExport(event));

        /*
         * Captured now, while the rows still exist, for the notification that
         * goes out after this transaction commits. It cannot be gathered later:
         * that is the point of the whole method.
         */
        List<NotificationEvents.EventForceDeleted.Buyer> buyers = bookings.stream()
                .map(b -> new NotificationEvents.EventForceDeleted.Buyer(
                        b.getUserId(), b.getBookingRef(), b.getTotalUsdCents()))
                .toList();

        /*
         * The order below is the foreign key graph read backwards, and every
         * step of it is load-bearing. V1 gave most of these tables no ON DELETE
         * clause, so anything out of order surfaces as a raw 23503 rather than
         * as a partial delete - which is the one mercy in the design.
         *
         * scan_log first: it points at event, ticket AND booking, so it blocks
         * all three and nothing blocks it.
         */
        int scans = scanLogRepository.deleteByEventId(eventId);

        // ticket -> booking_item, no cascade. This is what makes the booking
        // cascade that the schema DOES declare fail on any booking that reached
        // issuance.
        int tickets = ticketRepository.deleteByEventId(eventId);

        // The payment records, receipts before transactions before the legacy
        // ABA row - which has no entity at all and is the easiest of these to
        // forget, since nothing in Java maps it.
        int receipts = paymentTransactionRepository.deleteWebhookEventsByEventId(eventId);
        int abaRows = paymentTransactionRepository.deleteAbaPaymentsByEventId(eventId);
        int payments = paymentTransactionRepository.deleteByEventId(eventId);

        int history = bookingStatusHistoryRepository.deleteByEventId(eventId);

        // Explicitly, though booking would cascade to them: the lines point at
        // event_seat and event_zone with no ON DELETE, and those go with the
        // event a few lines below.
        bookingItemRepository.deleteByEventId(eventId);
        int deletedBookings = bookingRepository.deleteByEventId(eventId);

        // After the bookings, which hold hold_id UNIQUE NOT NULL. Every hold
        // goes now, not just the finished ones the ordinary delete allows -
        // there is no customer whose checkout this protects any more, because
        // the event they were buying into is about to stop existing.
        int holds = holdRepository.deleteByEventId(eventId);

        // Not PAID - that was refused above. A REQUESTED or APPROVED claim is
        // an invoice for money nobody has sent yet, and it cannot outlive the
        // event it invoices for.
        int payouts = payoutRequestRepository.deleteByEventId(eventId);

        String cover = event.getCloudinaryImageId();
        String banner = event.getCloudinaryBannerId();
        String titleEn = event.getTitleEn();
        String titleKm = event.getTitleKm();

        /*
         * Everything above went out as bulk JPQL, which the persistence context
         * knows nothing about: the bookings and payments the export loaded are
         * still managed here, still pointing at this Event. Removing it with
         * those in place fails the flush.
         *
         * Cleared rather than each entity detached individually, because the
         * set to detach is "everything the export touched", which is the same
         * thing said less reliably.
         */
        entityManager.flush();
        entityManager.clear();

        // By id, not by the instance in hand - the clear above detached it, and
        // deleting a detached entity would merge it back first, re-attaching
        // the very graph that was just erased.
        //
        // Takes seat_class, event_zone, event_seat and event_review with it,
        // by the cascades V1 and V14 did declare.
        eventRepository.deleteById(eventId);

        // Last, and outside the database's control. Cloudinary cannot be rolled
        // back, so a destroy that ran before a transaction that then failed
        // would leave a live listing with a broken image.
        destroyIfOurs(cover);
        destroyIfOurs(banner);

        events.publishEvent(new NotificationEvents.EventForceDeleted(
                eventId, titleEn, titleKm, buyers));

        log.info("Force-deleted event {} (\"{}\"): {} booking(s), {} ticket(s), {} payment(s), {} ABA row(s), "
                        + "{} webhook receipt(s), {} history row(s), {} hold(s), {} payout claim(s), "
                        + "{} scan log row(s)",
                eventId, titleEn, deletedBookings, tickets, payments, abaRows, receipts, history,
                holds, payouts, scans);
    }

    /**
     * Build the CSV from the rows as they stand right now.
     *
     * <p>Called twice per force delete - once for the admin's download, once
     * into the log - and both readings happen inside a transaction that has the
     * event, so the two cannot disagree about what was sold.
     */
    private String renderExport(Event event) {
        Long eventId = event.getId();
        return EventSalesExport.render(
                event,
                bookingRepository.findByEvent_IdOrderByCreatedAtAsc(eventId),
                paymentTransactionRepository.findByEventId(eventId),
                ticketRepository.findByEventId(eventId));
    }

    /**
     * A filename somebody can find again.
     *
     * <p>The event id leads, because the title is the part that will have been
     * forgotten by the time anybody goes looking, and two events can share one.
     */
    private String filename(Event event) {
        String slug = event.getTitleEn() == null ? "event"
                : event.getTitleEn().toLowerCase().replaceAll("[^a-z0-9]+", "-")
                        .replaceAll("(^-|-$)", "");
        if (slug.isBlank()) slug = "event";
        if (slug.length() > 40) slug = slug.substring(0, 40);
        return "event-" + event.getId() + "-" + slug + "-sales.csv";
    }

    /**
     * Mirrors EventDeletionService.destroyIfOurs, for the same reason it exists
     * there: since V18 the column may hold a URL we did not upload, which has
     * no public id to destroy and is not ours to remove.
     */
    private void destroyIfOurs(String url) {
        if (url == null) return;
        try {
            String publicId = cloudinaryService.publicIdFromUrl(url);
            if (publicId != null) {
                cloudinaryService.destroy(publicId);
            }
        } catch (RuntimeException e) {
            log.warn("Could not remove image {} of force-deleted event: {}", url, e.getMessage());
        }
    }
}
