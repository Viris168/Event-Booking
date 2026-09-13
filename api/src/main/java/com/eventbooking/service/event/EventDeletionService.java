package com.eventbooking.service.event;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.exception.catalog.EventNotDeletableException;
import com.eventbooking.exception.catalog.EventNotFoundException;
import com.eventbooking.model.Event;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.repository.ScanLogRepository;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Image.CloudinaryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Erasing an event, permanently.
 *
 * <p>Distinct from take-down, which is the reversible action and the right one
 * almost always: take-down pulls a listing off sale and leaves everything else
 * standing. This is for the listings that should never have existed - spam, a
 * duplicate posted twice, a test event on production - where leaving a
 * TAKEN_DOWN row in the moderation table forever is just clutter that outlives
 * its usefulness.
 *
 * <p>Its own class rather than another method on EventServiceimpl, which
 * already carries a twelve-argument constructor. Deletion needs three
 * repositories that the catalogue lane has no other use for - bookings, holds
 * and the gate log - and all three are here for one reason: they are the tables
 * pointing at {@code event} that V1 gave no {@code ON DELETE} clause.
 *
 * <p>Moved out of the admin package once organisers got the same action on
 * their own events. The guard is what makes that safe rather than generous: it
 * refuses anything that has ever been booked, so an organiser can only remove a
 * listing nobody bought - the draft, the rejection, the duplicate posted twice.
 */
@Service
@Slf4j
public class EventDeletionService {

    private final EventRepository eventRepository;
    private final BookingRepository bookingRepository;
    private final HoldRepository holdRepository;
    private final ScanLogRepository scanLogRepository;
    private final CloudinaryService cloudinaryService;
    private final OrganizerResolver organizerResolver;

    public EventDeletionService(EventRepository eventRepository,
                                     BookingRepository bookingRepository,
                                     HoldRepository holdRepository,
                                     ScanLogRepository scanLogRepository,
                                     CloudinaryService cloudinaryService,
                                     OrganizerResolver organizerResolver) {
        this.eventRepository = eventRepository;
        this.bookingRepository = bookingRepository;
        this.holdRepository = holdRepository;
        this.scanLogRepository = scanLogRepository;
        this.cloudinaryService = cloudinaryService;
        this.organizerResolver = organizerResolver;
    }

    /**
     * Remove the event and everything that exists only because of it.
     *
     * <p>What goes with it, by the cascades V1 and V14 declared: seat classes,
     * zones, the whole {@code event_seat} map, and the review history. All four
     * describe this event and nothing else, so none of them outlives it.
     *
     * <p>What must NOT go with it is a booking, and the guard below is why this
     * method is worth more than a {@code deleteById}. {@code booking.event_id}
     * has no cascade, so the delete would fail as a raw 23503 - and the fix for
     * that must never be to widen the cascade, because the rows on the other
     * end are somebody's tickets to a show they paid for.
     *
     * @throws EventNotDeletableException when a booking or an in-flight
     *         checkout exists. The admin is pointed at take-down, which is what
     *         they actually want in that case.
     */
    /**
     * The organiser removing their own event.
     *
     * <p>Ownership first, then the identical guard: they can only reach a
     * listing that has never sold anything, and the cascade is the same either
     * way. Deliberately no extra rule about which statuses an organiser may
     * delete - a bookingless event is a bookingless event whether it is a draft
     * or was published and never sold a seat.
     */
    @Transactional
    public void deleteAsOrganizer(Long organizerId, Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        organizerResolver.requireOwner(organizerId, event.getOrganizerId(), "event", eventId);
        delete(null, eventId);
    }

    /**
     * @param adminUserId who is deleting, for the log line - null when an
     *        organiser removed their own, which deleteAsOrganizer authorized.
     */
    @Transactional
    public void delete(Long adminUserId, Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        long bookings = bookingRepository.countByEvent_Id(eventId);
        long activeHolds = holdRepository.countByEvent_IdAndStatus(eventId, HoldStatus.ACTIVE);
        if (bookings > 0 || activeHolds > 0) {
            throw new EventNotDeletableException(eventId, bookings, activeHolds);
        }

        /*
         * The two tables that reference event with no ON DELETE clause and are
         * nonetheless safe to drop, now that the guard above has established
         * nobody bought anything.
         *
         * scan_log first: a refused scan writes a row here and no ticket at
         * all - which is exactly what V16 built this table for - so an event
         * with zero bookings can still have gate history, and it would block
         * the delete on its own.
         *
         * Then the holds, which at this point are only EXPIRED, RELEASED or
         * CONSUMED: carts nobody is standing in. hold_zone_line cascades from
         * hold in the database, and Postgres applies that even though a bulk
         * JPQL delete does not run JPA's own cascade.
         */
        int scans = scanLogRepository.deleteByEventId(eventId);
        int holds = holdRepository.deleteByEventId(eventId);

        // Read before the row goes: afterwards there is nothing left saying
        // which files were this event's, and they would sit in Cloudinary
        // indefinitely with nothing referring to them.
        String cover = event.getCloudinaryImageId();
        String banner = event.getCloudinaryBannerId();

        eventRepository.delete(event);

        // After the delete, not before. A destroy that succeeded against an
        // event the transaction then rolled back would leave a live listing
        // with a broken image - the database can be rolled back and Cloudinary
        // cannot, so the irreversible half goes last.
        destroyIfOurs(cover);
        destroyIfOurs(banner);

        log.info("{} deleted event {} (\"{}\"), clearing {} scan log row(s) and {} finished hold(s)",
                adminUserId == null ? "Its organizer" : "Admin " + adminUserId,
                eventId, event.getTitleEn(), scans, holds);
    }

    /**
     * Delete the file behind a stored URL, but only when it is one of ours.
     *
     * <p>Since V18 the column may hold an image hosted anywhere. A URL we did
     * not upload has no public id to destroy and is not ours to remove - which
     * is what publicIdFromUrl returning null means here. Mirrors the helper in
     * EventServiceimpl, deliberately: both answer the same question about the
     * same two columns.
     */
    private void destroyIfOurs(String url) {
        if (url == null) return;
        try {
            String publicId = cloudinaryService.publicIdFromUrl(url);
            if (publicId != null) {
                cloudinaryService.destroy(publicId);
            }
        } catch (RuntimeException e) {
            // The event is already gone and the transaction is committing. An
            // orphaned image costs storage; a failure thrown from here would
            // cost the admin their delete and leave them retrying an event
            // that no longer exists.
            log.warn("Could not remove image {} of deleted event: {}", url, e.getMessage());
        }
    }
}
