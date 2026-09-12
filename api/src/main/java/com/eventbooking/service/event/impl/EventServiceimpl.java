package com.eventbooking.service.event.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.catalog.EventSnapshotter;
import com.eventbooking.catalog.EventStateMachine;
import com.eventbooking.catalog.error.*;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventReviewResponse;
import com.eventbooking.dto.event.EventSearchCriteria;
import com.eventbooking.model.*;
import com.eventbooking.repository.*;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.mapper.Event.EventMapper;
import com.eventbooking.mapper.Event.EventZoneMapper;
import com.eventbooking.mapper.SeatClass.SeatClassMapper;
import com.eventbooking.service.Image.CloudinaryResponse;
import com.eventbooking.service.Image.CloudinaryService;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.stream.Collectors;

import static com.eventbooking.Enumeration.EventTransition.SUBMIT;

@Service
public class EventServiceimpl implements EventService {

    /** Ceiling on ?size for the public catalogue. */
    private static final int MAX_PAGE_SIZE = 100;

    private final VenueRepository venueRepository;
    private final EventRepository eventRepository;
    private final SeatClassRepository seatClassRepository;
    private final EventZoneRepository eventZoneRepository;
    private final CloudinaryService cloudinaryService;
    private final OrganizerResolver organizerResolver;
    private final EventStateMachine stateMachine;
    private final EventReviewRepository eventReviewRepository;
    private final AppUserRepository appUserRepository;
    private final EventSeatRepository eventSeatRepository;
    private final EventSnapshotter eventSnapshotter;

    public EventServiceimpl(VenueRepository venueRepository, EventRepository eventRepository, SeatClassRepository seatClassRepository, EventZoneRepository eventZoneRepository, CloudinaryService cloudinaryService, OrganizerResolver organizerResolver, EventStateMachine stateMachine, EventReviewRepository eventReviewRepository, AppUserRepository appUserRepository, EventSeatRepository eventSeatRepository, EventSnapshotter eventSnapshotter) {
        this.organizerResolver = organizerResolver;
        this.stateMachine = stateMachine;
        this.eventReviewRepository = eventReviewRepository;
        this.appUserRepository = appUserRepository;
        this.venueRepository = venueRepository;
        this.eventRepository = eventRepository;
        this.seatClassRepository = seatClassRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.cloudinaryService = cloudinaryService;
        this.eventSeatRepository = eventSeatRepository;
        this.eventSnapshotter = eventSnapshotter;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EventResponse> listEvents(EventSearchCriteria criteria, int page, int size) {
        // Was findAll(), which published every DRAFT to the home page and the
        // events list the instant an organiser created one - title, slug,
        // venue and prices, to any anonymous caller.
        //
        // The page size is clamped rather than trusted: it comes straight off
        // the query string, and toEventResponse below runs three reads per
        // event, so an unbounded size is an invitation to ask for the whole
        // catalogue several thousand queries at a time.
        return eventRepository.search(
                        EventStatus.publiclyVisible(),
                        criteria.titleLike(),
                        criteria.provinceCode(),
                        criteria.startsFrom(),
                        criteria.startsBefore(),
                        criteria.minPriceCents(),
                        criteria.maxPriceCents(),
                        criteria.sort().name(),
                        PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE)))
                .map(this::toEventResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EventResponse> listForReview(EventStatus status, int page, int size) {
        // Oldest submission first: a review queue is a fair-order queue, so the
        // organiser who has been waiting longest is looked at first. V14's
        // partial index idx_event_pending_review is on exactly this column and
        // this direction.
        //
        // Rows with a null submitted_at - anything never submitted, or
        // withdrawn - sort last under Postgres' default NULLS LAST for ASC.
        // Only PENDING_REVIEW is a genuine queue and every row in it has the
        // column set, so this matters solely when an admin browses some other
        // status out of curiosity.
        Page<Event> events = eventRepository.findByStatus(
                status, PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "submittedAt")));
        // ADMIN audience: this screen's whole purpose is the three decisions,
        // and the organiser-scoped default would send back only WITHDRAW -
        // an action the admin cannot perform, on a queue with no other buttons.
        return events.map(e -> toEventResponse(e, Audience.ADMIN));
    }

    @Override
    @Transactional
    public EventResponse createEvent(Long organizerId, CreateEventRequest request) {
        Venue venue = requireHostable(venueRepository.findById(request.venueId())
                .orElseThrow(() -> new VenueNotFoundException(request.venueId())));

        // You may stage events at your own venue, or at a shared one. Without
        // this an organiser could hang events off a COMPETITOR's venue, and the
        // venue owner would have no way to see it, let alone stop it - so an
        // owned venue still admits only its owner. A shared venue is the public
        // hall case: it has no owner to be taken advantage of, and refusing
        // there just meant the second organiser to want Olympic Stadium could
        // not run anything at all.
        organizerResolver.requireOwnerOrShared(organizerId, venue.getOrganizerId(), "venue", venue.getId());

        Event event = eventRepository.save(EventMapper.toEventEntity(request, venue, organizerId));
        // A freshly created event has no inventory, no images and no review
        // history yet, so the empty collections are the truth rather than a
        // shortcut - but its actions and editability still come from the state
        // machine, so the form can render its footer immediately.
        return EventMapper.toEventResponse(event, List.of(), List.of(), null, null,
                actionsFor(event, Audience.ORGANIZER),
                stateMachine.isEditable(event.getStatus()),
                null);
    }

    @Override
    @Transactional(readOnly = true)
    public EventResponse getEvent(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        // Filtering the list alone would have been half a fix: ids are
        // sequential, so anyone could walk /event/1, /event/2 and read the
        // drafts the list no longer shows.
        //
        // 404 rather than 403 on purpose. A 403 confirms the row exists, which
        // is the one bit of information a caller with no business knowing about
        // an unpublished event should not get.
        if (!event.getStatus().isPubliclyVisible()) {
            throw new EventNotFoundException(eventId);
        }
        return toEventResponse(event);
    }

    @Override
    @Transactional
    public EventResponse updateEvent(Long organizerId, Long eventId, UpdateEventRequest request) {
        Event event = requireOwnedEvent(organizerId, eventId);

        // The organiser form greys its inputs out in these states, but a greyed
        // input is a suggestion - nothing stopped the PATCH going through. Which
        // matters most for APPROVED: an admin approves version A, the organiser
        // edits, publishes version B, and review never saw what went on sale.
        // Changing an approved event costs a WITHDRAW back to DRAFT.
        if (!stateMachine.isEditable(event.getStatus())) {
            throw new EventNotEditableException(event.getStatus());
        }

        if (request.inventoryMode() != null
                && request.inventoryMode() != event.getInventoryMode()
                && (seatClassRepository.existsByEventId(eventId)
                || eventZoneRepository.existsByEventId(eventId))) {
            throw new InventoryModeChangeBlockedException(
                    "Cannot change inventory mode after inventory has been created for event: " + eventId);
        }

        if (request.venueId() != null) {
            Venue venue = venueRepository.findById(request.venueId())
                    .orElseThrow(() -> new VenueNotFoundException(request.venueId()));
            // Same rule as createEvent: your own venue, or a shared one.
            organizerResolver.requireOwnerOrShared(organizerId, venue.getOrganizerId(), "venue", venue.getId());

            /*
             * Only a MOVE has to be hostable.
             *
             * This used to call requireHostable on any request carrying a
             * venueId, changed or not - and a PATCH client that echoes the
             * event's current venue back (as the organiser form does) then
             * could not edit an event whose venue had since been retired. Not
             * even its title: the save came back 409 VENUE_DISABLED over a
             * field nobody had touched.
             *
             * The rule VenueDisabledException documents is "a disabled venue
             * may not take on new work - binding a fresh event to it, or moving
             * an existing one onto it". Re-sending the venue an event already
             * sits in is neither.
             */
            if (!venue.getId().equals(event.getVenue().getId())) {
                requireHostable(venue);
                event.setVenue(venue);
            }
        }

        if (request.inventoryMode() != null) event.setInventoryMode(request.inventoryMode());
        if (request.slug() != null) event.setSlug(request.slug());
        if (request.titleEn() != null) event.setTitleEn(request.titleEn());
        if (request.titleKm() != null) event.setTitleKm(request.titleKm());
        if (request.descriptionEn() != null) event.setDescriptionEn(request.descriptionEn());
        if (request.descriptionKm() != null) event.setDescriptionKm(request.descriptionKm());
        if (request.category() != null) event.setCategory(request.category());
        if (request.cover() != null) event.setCover(request.cover());
        if (request.startsAt() != null) event.setStartsAt(request.startsAt());
        if (request.doorsOpenAt() != null) event.setDoorsOpenAt(request.doorsOpenAt());
        if (request.salesOpenAt() != null) event.setSalesOpenAt(request.salesOpenAt());
        if (request.salesCloseAt() != null) event.setSalesCloseAt(request.salesCloseAt());

        validateSchedule(event);
        eventRepository.save(event);

        return toEventResponse(event);
    }

    @Override
    @Transactional
    public EventResponse publishEvent(Long organizerId, Long eventId) {
        Event event = requireOwnedEvent(organizerId, eventId);

        event.setStatus(stateMachine.requireTransition(
                event.getStatus(), EventTransition.PUBLISH));
        eventRepository.save(event);
        return toEventResponse(event);
    }

    /**
     * Pull an event off sale for good. TAKEN_DOWN has been in the enum and in
     * the V1 CHECK since the first migration with nothing able to reach it, so
     * a listing that turned out to be fraudulent, mis-priced or cancelled could
     * only be left published.
     *
     * <p>No inventory is touched. verifyEventIsOnSale already requires
     * PUBLISHED, so sales stop the moment this commits; holds and bookings that
     * already exist stay valid, which is what refunding or honouring them
     * needs.
     *
     * <p>Terminal by construction: publishEvent only accepts DRAFT, so nothing
     * puts a taken-down event back on sale. Reversing it is a deliberate
     * decision that should arrive with an audit trail, not as a side effect of
     * this method being lenient.
     *
     * <p>TODO: this is a PLATFORM_ADMIN action. There is no authorization layer
     * to gate it on yet (SecurityConfig permits everything), so the check lands
     * with the JWT filter.
     */
    @Override
    @Transactional
    public EventResponse takeDownEvent(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));


        event.setStatus(stateMachine.requireTransition(
                event.getStatus(), EventTransition.TAKE_DOWN));
        eventRepository.save(event);
        return toEventResponse(event);
    }

    @Override
    @Transactional
    public EventResponse submitForReview(Long organizerId, Long eventId, Long actorUserId) {
        Event event = requireOwnedEvent(organizerId, eventId);

        // Validate before touching anything: a refused submit has to leave the
        // event exactly as it was, with no half-applied status or timestamp.
        requireSomethingToSell(event);

        event.setSubmittedAt(Instant.now());
        return transitionAndLog(event, EventTransition.SUBMIT, actorUserId, null,
                eventSnapshotter.capture(event));
    }

    @Override
    @Transactional
    public EventResponse withdrawFromReview(Long organizerId, Long eventId, Long actorUserId) {
        Event event = requireOwnedEvent(organizerId, eventId);

        // Cleared, not left behind: submitted_at is what the queue sorts on, so
        // a resubmitted event that kept its first timestamp would claim to have
        // been waiting since an attempt that was taken back.
        event.setSubmittedAt(null);
        return transitionAndLog(event, EventTransition.WITHDRAW, actorUserId, null, null);
    }

    @Override
    @Transactional
    public EventResponse approve(Long adminUserId, Long eventId) {
        // Plain load, not requireOwnedEvent: an admin does not own the event, so
        // the ownership helper would 403 the very person allowed to do this.
        // Authorization happened in the controller, via AdminResolver.
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        // The snapshot matters most here: it is the baseline the next resubmit
        // is diffed against, so a later re-review reads as "the title changed"
        // rather than as a second full read-through.
        return transitionAndLog(event, EventTransition.APPROVE, adminUserId, null,
                eventSnapshotter.capture(event));
    }

    @Override
    @Transactional
    public EventResponse reject(Long adminUserId, Long eventId, String message) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        // Out of the queue, so the timestamp goes with it.
        event.setSubmittedAt(null);
        return transitionAndLog(event, EventTransition.REJECT, adminUserId, message, null);
    }

    @Override
    @Transactional
    public EventResponse requestChanges(Long adminUserId, Long eventId, String message) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        event.setSubmittedAt(null);
        return transitionAndLog(event, EventTransition.REQUEST_CHANGES, adminUserId, message, null);
    }

    @Override
    @Transactional(readOnly = true)
    public List<EventReviewResponse> getReviewHistory(Long eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new EventNotFoundException(eventId);
        }

        // Oldest first: the history reads as a story, and each entry's diff is
        // against the one before it, which only makes sense forwards.
        List<EventReview> reviews = eventReviewRepository.findByEventIdOrderByCreatedAtDesc(eventId)
                .stream()
                .sorted(Comparator.comparing(EventReview::getCreatedAt))
                .toList();

        // Names in one query instead of one per row. A four-entry history would
        // otherwise be four extra selects for two distinct people.
        Map<Long, String> actorNames = appUserRepository
                .findAllById(reviews.stream().map(EventReview::getActorId).collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(AppUser::getId, AppUser::getDisplayName));

        List<EventReviewResponse> out = new ArrayList<>(reviews.size());
        String previousSnapshot = null;
        for (EventReview review : reviews) {
            // Diff against the last entry that carried a snapshot, not the last
            // entry: REJECT and REQUEST_CHANGES store none, and treating their
            // null as "everything changed" would put a full diff on the next
            // resubmit for edits the organiser never made.
            List<EventReviewResponse.FieldChange> changes = eventSnapshotter
                    .diff(previousSnapshot, review.getSnapshot())
                    .stream()
                    .map(c -> new EventReviewResponse.FieldChange(c.field(), c.before(), c.after()))
                    .toList();

            out.add(new EventReviewResponse(
                    review.getId(),
                    review.getAction(),
                    review.getMessage(),
                    review.getActorId(),
                    actorNames.get(review.getActorId()),
                    review.getFromStatus(),
                    review.getToStatus(),
                    review.getCreatedAt(),
                    changes));

            if (review.getSnapshot() != null) {
                previousSnapshot = review.getSnapshot();
            }
        }
        return out;
    }

    /**
     * Read-only transaction, not a bare query: toEventResponse walks
     * event.getVenue(), which is a LAZY proxy. Without a session open across
     * the whole loop the proxy is detached by the time the mapper touches it
     * and every row throws LazyInitializationException.
     */
    @Override
    @Transactional(readOnly = true)
    public List<EventResponse> listForOrganizer(Long organizerId, EventStatus status) {
        return eventRepository.findForOrganizer(organizerId, status)
                .stream()
                .map(this::toEventResponse)
                .toList();
    }

    /**
     * Refuse to queue an event a customer could not buy anything from.
     *
     * <p>Without this an admin opens a review, finds an empty shell, and has to
     * reject it - spending a human on something the server already knew.
     */
    private void requireSomethingToSell(Event event) {
        switch (event.getInventoryMode()) {
            case ZONED -> requireZones(event);
            case SEATED -> requireSeats(event);
            case MIXED -> {
                requireZones(event);
                requireSeats(event);
            }
        }
    }

    private void requireZones(Event event) {
        if (!eventZoneRepository.existsByEventId(event.getId())) {
            throw new NoInventoryException(
                    "Event " + event.getId() + " is " + event.getInventoryMode()
                            + " but has no zones, so there is nothing to sell");
        }
    }

    /**
     * A seat class is a price. A price with no seats behind it sells nothing, so
     * "has seat classes" is not the check - "every seat class has seats" is.
     */
    private void requireSeats(Event event) {
        List<SeatClass> seatClasses = seatClassRepository.findAllByEventId(event.getId());
        if (seatClasses.isEmpty()) {
            throw new NoInventoryException(
                    "Event " + event.getId() + " is " + event.getInventoryMode()
                            + " but has no seat classes, so there is nothing to sell");
        }

        // One query and a grouping rather than a count per tier: the keys are
        // exactly the tiers that have seats, so any tier missing from the set is
        // the empty one, and the message can name it.
        Set<Long> tiersWithSeats = eventSeatRepository.findByEventId(event.getId()).stream()
                .map(seat -> seat.getSeatClass().getId())
                .collect(Collectors.toSet());

        SeatClass empty = seatClasses.stream()
                .filter(seatClass -> !tiersWithSeats.contains(seatClass.getId()))
                .findFirst()
                .orElse(null);

        if (empty != null) {
            throw new NoInventoryException(
                    "Seat class \"" + empty.getNameEn() + "\" has no seats assigned, "
                            + "so nothing can be sold at that price");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public void verifyEventIsOnSale(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        Instant now = Instant.now();

        if (event.getStatus() != EventStatus.PUBLISHED
                || now.isBefore(event.getSalesOpenAt())
                || !now.isBefore(event.getSalesCloseAt())) {
            throw new EventNotOnSaleException(eventId);
        }
    }

    /**
     * Load an event the caller is allowed to write to. 404 when it does not
     * exist, 403 when it belongs to another organiser - in that order, so a
     * typo in an id reads as a typo rather than as a permissions problem.
     */
    private Event requireOwnedEvent(Long organizerId, Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        organizerResolver.requireOwner(organizerId, event.getOrganizerId(), "event", eventId);
        return event;
    }

    /**
     * A venue may only take on new events while it is enabled. Reading a
     * disabled venue stays legal - see VenueDisabledException for why it is a
     * 409 and not a 404.
     */
    private static Venue requireHostable(Venue venue) {
        if (Boolean.TRUE.equals(venue.getIsDisabled())) {
            throw new VenueDisabledException(venue.getId());
        }
        return venue;
    }

    /**
     * The four timestamps as one rule, checked against whatever the event
     * actually holds rather than against whichever subset a PATCH happened to
     * send. Mirrors the DB constraint (sales_close_at <= starts_at) plus the
     * two orderings the schema cannot express, so a bad combination comes back
     * as a 400 naming the field instead of a 500 from a raw check violation.
     */
    private static void validateSchedule(Event event) {
        if (event.getDoorsOpenAt().isAfter(event.getStartsAt())) {
            throw new InvalidEventScheduleException(
                    "doorsOpenAt must be before or equal to startsAt");
        }
        if (!event.getSalesOpenAt().isBefore(event.getSalesCloseAt())) {
            throw new InvalidSalesWindowException(
                    "salesOpenAt must be before salesCloseAt");
        }
        if (event.getSalesCloseAt().isAfter(event.getStartsAt())) {
            throw new InvalidSalesWindowException(
                    "salesCloseAt must be before or equal to startsAt");
        }
    }


    @Override
    @Transactional
    public EventResponse uploadImage(Long organizerId, Long eventId, ImageRole role, MultipartFile file) {
        Event event = requireOwnedEvent(organizerId, eventId);

        // Read before the upload: once the column is overwritten there is no
        // record of the old image, and the file behind it is unreachable.
        String replaced = currentImageUrl(event, role);

        CloudinaryResponse uploaded = cloudinaryService.upload(file, file.getOriginalFilename());

        // The delivery URL, not the public id — see V18. The uploader hands
        // back both, so this costs nothing and frees the column from Cloudinary.
        writePublicId(eventId, role, uploaded.url());

        // Only after the new URL is safely stored. A delete first would lose the
        // old image with nothing to show in its place if the upload failed.
        if (replaced != null && !replaced.equals(uploaded.url())) {
            destroyIfOurs(replaced);
        }

        return reloadResponse(eventId);
    }

    @Override
    @Transactional
    public EventResponse deleteImage(Long organizerId, Long eventId, ImageRole role) {
        Event event = requireOwnedEvent(organizerId, eventId);

        String url = currentImageUrl(event, role);
        if (url == null) {
            throw new EventImageNotFoundException(eventId, role);
        }

        writePublicId(eventId, role, null);
        destroyIfOurs(url);

        return reloadResponse(eventId);
    }

    private static String currentImageUrl(Event event, ImageRole role) {
        return role == ImageRole.BANNER ? event.getCloudinaryBannerId() : event.getCloudinaryImageId();
    }

    /**
     * Delete the file behind a stored URL, but only when it is one of ours.
     *
     * <p>Since V18 the column may hold an image hosted anywhere. A URL we did
     * not upload has no public id to destroy and is not ours to remove, so
     * clearing the column is the whole operation - which is what
     * publicIdFromUrl returning null means here.
     */
    private void destroyIfOurs(String url) {
        String publicId = cloudinaryService.publicIdFromUrl(url);
        if (publicId != null) {
            cloudinaryService.destroy(publicId);
        }
    }

    /**
     * One column, not the whole row - see EventRepository for why a save()
     * here would let a simultaneous cover and banner upload erase each other.
     */
    private void writePublicId(Long eventId, ImageRole role, String publicId) {
        if (role == ImageRole.BANNER) {
            eventRepository.updateBannerImageId(eventId, publicId);
        } else {
            eventRepository.updateCoverImageId(eventId, publicId);
        }
    }


    private EventResponse reloadResponse(Long eventId) {
        return toEventResponse(eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId)));
    }

    /**
     * Who is being drawn this response, which decides what
     * {@code available_actions} may contain.
     *
     * <p>Not the same as authorization. The server refuses an action the caller
     * may not perform regardless of what was listed here; this only stops a
     * screen offering a button that would come back 403.
     */
    private enum Audience { ORGANIZER, ADMIN }

    private EventResponse toEventResponse(Event event) {
        return toEventResponse(event, Audience.ORGANIZER);
    }

    private EventResponse toEventResponse(Event event, Audience audience) {
        List<SeatClassResponse> seatClasses =
                seatClassRepository.findAllByEventId(event.getId())
                        .stream()
                        .map(SeatClassMapper::toSeatClassResponse)
                        .toList();

        List<EventZoneResponse> zones =
                eventZoneRepository.findAllByEventId(event.getId())
                        .stream()
                        .map(EventZoneMapper::toEventZoneResponse)
                        .toList();
        return EventMapper.toEventResponse(
                event,
                seatClasses,
                zones,
                // Stored as delivery URLs since V18, so they go straight out.
                event.getCloudinaryImageId(),
                event.getCloudinaryBannerId(),
                actionsFor(event, audience),
                stateMachine.isEditable(event.getStatus()),
                latestReview(event.getId()));
    }

    /**
     * The actions this audience may take on this event.
     *
     * <p>availableTransitions answers "legal from this status", which is not the
     * same question as "yours to perform": APPROVE and WITHDRAW are both legal
     * from PENDING_REVIEW, but they belong to different people. Filtering here
     * rather than in the client means the rule lives beside the state machine
     * instead of being copied into every screen that renders a menu - and the
     * two copies drifting is exactly how a UI ends up offering a button that
     * comes back 403.
     */
    private List<EventTransition> actionsFor(Event event, Audience audience) {
        return stateMachine.availableTransitions(event.getStatus()).stream()
                .filter(audience == Audience.ADMIN
                        ? EventTransition::isAdminAction
                        : EventTransition::isOrganizerAction)
                .toList();
    }

    /**
     * The row the organiser's status banner renders, or null before any
     * transition. Inlined into the event response so the form does not need a
     * second request to draw its own header.
     */
    private EventReviewResponse latestReview(Long eventId) {
        return eventReviewRepository.findFirstByEventIdOrderByCreatedAtDesc(eventId)
                .map(review -> new EventReviewResponse(
                        review.getId(),
                        review.getAction(),
                        review.getMessage(),
                        review.getActorId(),
                        appUserRepository.findById(review.getActorId())
                                .map(AppUser::getDisplayName)
                                .orElse(null),
                        review.getFromStatus(),
                        review.getToStatus(),
                        review.getCreatedAt(),
                        List.of()))
                .orElse(null);
    }

    private EventResponse transitionAndLog(
            Event event,
            EventTransition transition,
            Long actorUserId,
            String message,
            String snapshot) {
        EventStatus from = event.getStatus();
        EventStatus to = stateMachine.requireTransition(from, transition);
        event.setStatus(to);
        eventRepository.save(event);
        EventReview review = EventReview.builder()
                .event(event)
                .actorId(actorUserId)
                .action(transition)
                .message(message)
                .fromStatus(from)
                .toStatus(to)
                .snapshot(snapshot)
                .build();
        eventReviewRepository.save(review);
        return toEventResponse(event);
    }
}
