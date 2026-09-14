package com.eventbooking.service.event.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.service.event.EventSnapshotter;
import com.eventbooking.service.event.EventStateMachine;
import com.eventbooking.exception.catalog.*;
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
import com.eventbooking.service.notification.NotificationEvents;
import com.eventbooking.service.Image.CloudinaryResponse;
import com.eventbooking.service.Image.CloudinaryService;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
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
@Slf4j
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
    private final ApplicationEventPublisher events;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final OrganizerApplicationRepository organizerApplicationRepository;

    public EventServiceimpl(VenueRepository venueRepository, EventRepository eventRepository, SeatClassRepository seatClassRepository, EventZoneRepository eventZoneRepository, CloudinaryService cloudinaryService, OrganizerResolver organizerResolver, EventStateMachine stateMachine, EventReviewRepository eventReviewRepository, AppUserRepository appUserRepository, EventSeatRepository eventSeatRepository, EventSnapshotter eventSnapshotter, ApplicationEventPublisher events, OrganizerProfileRepository organizerProfileRepository, OrganizerApplicationRepository organizerApplicationRepository) {
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
        this.events = events;
        this.organizerProfileRepository = organizerProfileRepository;
        this.organizerApplicationRepository = organizerApplicationRepository;
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
                        // browsable, not publiclyVisible: a taken-down event
                        // keeps its page for the people holding tickets to it,
                        // but it has been pulled from sale and has no business
                        // being offered to somebody browsing.
                        EventStatus.browsable(),
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
        organizerResolver.requireOwner(organizerId, venue.getOrganizerId(), "venue", venue.getId());

        Event event = eventRepository.save(EventMapper.toEventEntity(request, venue, organizerId));
        // A freshly created event has no inventory, no images and no review
        // history yet, so the empty collections are the truth rather than a
        // shortcut - but its actions and editability still come from the state
        // machine, so the form can render its footer immediately.
        return EventMapper.toEventResponse(event, List.of(), List.of(), null, null,
                // Nothing sold - it was created a line ago.
                actionsFor(event, Audience.ORGANIZER, 0),
                stateMachine.isEditable(event.getStatus()),
                null, null, null);
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

        applyUpdate(event, request, organizerId);
        return toEventResponse(event);
    }

    /**
     * The same edit, made by a platform admin on somebody else's event.
     *
     * <p>Two things are deliberately different from the organiser's path above.
     * There is no ownership check - moderating means acting on events you do
     * not own, which is the entire point - and there is no
     * {@link EventStateMachine#isEditable} gate.
     *
     * <p>That gate exists to stop an organiser editing around review: approve
     * version A, publish version B. It has nothing to say to the reviewer
     * themselves, who is the party it protects. An admin correcting a misleading
     * title on a PENDING_REVIEW event is doing review, and one fixing a wrong
     * date on a PUBLISHED one is doing the job the moderation screen exists for
     * - the alternative being to take the listing down over a typo.
     *
     * <p>What is NOT skipped is the inventory-mode guard and the schedule
     * validation. Those protect the event's own consistency rather than the
     * review process, and they hold against every caller: an admin cannot turn
     * a seated event zoned any more than its owner can, because the seats that
     * people have already bought are the reason.
     */
    @Override
    @Transactional
    public EventResponse updateEventAsAdmin(Long adminUserId, Long eventId, UpdateEventRequest request) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        applyUpdate(event, request, null);

        log.info("Admin {} edited event {} ({})", adminUserId, eventId, event.getStatus());
        return toEventResponse(event);
    }

    /**
     * Copy a PATCH onto an event and save it.
     *
     * <p>Null means "not sent" throughout, which is what makes this a PATCH
     * rather than a PUT: the organiser form posts a handful of fields and the
     * admin dialog posts a different handful, and neither should blank what it
     * did not ask about.
     *
     * @param organizerIdForVenueCheck the caller's organizer_profile id, or null
     *        when an admin is editing. Only used to authorize a venue MOVE -
     *        an admin may move an event to any hostable venue, an organiser only
     *        to their own or a shared one.
     */
    private void applyUpdate(Event event, UpdateEventRequest request, Long organizerIdForVenueCheck) {
        Long eventId = event.getId();

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
            // Same rule as createEvent: it has to be your own venue. Skipped for
            // an admin, who has no organizer_profile to own a venue with.
            if (organizerIdForVenueCheck != null) {
                organizerResolver.requireOwner(
                        organizerIdForVenueCheck, venue.getOrganizerId(), "venue", venue.getId());
            }

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

        // Same reasoning as the organiser's copy: a finished event is already
        // gone from the catalogue, so there is nothing for a take-down to do.
        if (event.getStartsAt() != null && event.getStartsAt().isBefore(Instant.now())) {
            throw EventAlreadyFinishedException.cannotTakeDown(eventId);
        }


        event.setStatus(stateMachine.requireTransition(
                event.getStatus(), EventTransition.TAKE_DOWN));
        eventRepository.save(event);

        // Announced here rather than in transitionAndLog because a take-down is
        // not a review decision and writes no event_review row - see the note on
        // EventTransition. The organiser still has to be told: their event left
        // the catalogue without them doing anything.
        // No review id: a take-down writes no event_review row. It is terminal
        // by construction - publishEvent only accepts DRAFT - so the event id
        // alone already identifies the one occurrence there can ever be.
        events.publishEvent(new NotificationEvents.EventReviewed(
                event.getId(), EventTransition.TAKE_DOWN, null, null));

        return toEventResponse(event);
    }

    /**
     * The organiser pulling their own listing, before anyone has bought a ticket.
     *
     * <p>Separate from {@link #takeDownEvent} above rather than a parameter on
     * it, because the two differ in more than the caller. This one checks
     * ownership, refuses once anything has sold, and - the part a shared method
     * would get wrong - sends no notification. The admin's take-down tells the
     * organiser their event left the catalogue without them doing anything;
     * here they are the one doing it, and telling someone what they just did is
     * the clearest way to teach them to ignore the bell.
     *
     * <p>The sold check is the whole reason this is allowed at all. With no
     * tickets outstanding, pulling the listing affects nobody but the organiser,
     * so there is no decision for the platform to make. One sale later there is.
     */
    @Override
    @Transactional
    public EventResponse takeDownOwnEvent(Long organizerId, Long eventId) {
        Event event = requireOwnedEvent(organizerId, eventId);

        /*
         * Sales only block this while the show is still ahead of everyone.
         *
         * The rule exists because pulling a listing that people hold tickets
         * to is a refund decision, and refunds are the platform's call. Once
         * the event has actually happened that reasoning is spent: nobody is
         * going to turn up to it, the tickets were used or they were not, and
         * taking the listing down decides nothing for anybody. Leaving it
         * admin-only past that point just means an organiser has to ask
         * permission to tidy their own history.
         */
        /*
         * A finished event has nothing left to take down. It dropped out of the
         * public catalogue the moment its date passed, so pulling it would move
         * a status and change nothing anybody can see - and offering the action
         * implied there was still something on sale to stop.
         */
        if (event.getStartsAt() != null && event.getStartsAt().isBefore(Instant.now())) {
            throw EventAlreadyFinishedException.cannotTakeDown(eventId);
        }

        int sold = soldCount(eventId);
        if (sold > 0) {
            throw new EventHasSalesException(eventId, sold);
        }

        event.setStatus(stateMachine.requireTransition(
                event.getStatus(), EventTransition.TAKE_DOWN));
        eventRepository.save(event);

        log.info("Organizer {} took down their own event {} (nothing sold)", organizerId, eventId);
        return toEventResponse(event);
    }

    /**
     * Places sold at this event, across both halves of the inventory split.
     *
     * <p>Zones alone would under-report a SEATED or MIXED event by its entire
     * seat map - the same trap EventMapper's own comment describes - and here
     * that would mean letting an organiser pull a show whose seated tiers had
     * sold out.
     */
    private int soldCount(Long eventId) {
        int sold = eventZoneRepository.findAllByEventId(eventId).stream()
                .mapToInt(z -> z.getSoldQty() == null ? 0 : z.getSoldQty())
                .sum();
        sold += (int) eventSeatRepository.countByEvent_IdAndStatus(eventId, SeatStatus.SOLD);
        return sold;
    }

    /**
     * Put a taken-down event back on sale. The undo for the method above.
     *
     * <p>Nothing is rebuilt, because nothing was destroyed: a take-down changes
     * one column, and the event's seat map, zones, pricing, bookings and
     * tickets sat untouched the whole time. So this is the same one column back
     * the other way, and the catalogue, the seat picker and every link anyone
     * had to the event start working again exactly as they were.
     *
     * <p>The sales window is not touched either, and that is worth saying out
     * loud: an event restored after {@code sales_close_at} has passed is
     * PUBLISHED and still not buyable, because verifyEventIsOnSale checks the
     * clock as well as the status. That is the correct outcome - restoring is
     * not a licence to reopen sales that were meant to have ended - and an
     * admin who wants the window extended edits it, which is now something they
     * can do.
     */
    @Override
    @Transactional
    public EventResponse restoreEvent(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        /*
         * Only an event still ahead of everyone can be put back on sale. See
         * EventAlreadyFinishedException: past that date the status would be the
         * only thing that changed, and it would be saying something untrue.
         */
        if (event.getStartsAt() != null && event.getStartsAt().isBefore(Instant.now())) {
            throw EventAlreadyFinishedException.cannotRestore(eventId);
        }

        event.setStatus(stateMachine.requireTransition(
                event.getStatus(), EventTransition.RESTORE));
        eventRepository.save(event);

        // The organiser was told when it came down; they are owed the other
        // half. Unlike take-down this one can genuinely recur - see the dedupe
        // key in NotificationListener, which had to stop assuming it could not.
        events.publishEvent(new NotificationEvents.EventReviewed(
                event.getId(), EventTransition.RESTORE, null, null));

        log.info("Event {} restored to {}", eventId, event.getStatus());
        return toEventResponse(event);
    }

    /**
     * One event, for a platform admin, in any status.
     *
     * <p>{@link #getEvent} refuses anything not publicly visible, so an admin
     * opening the edit dialog on a DRAFT or a PENDING_REVIEW row would get the
     * 404 that endpoint gives a stranger walking sequential ids. The visibility
     * rule is right; it is just not about this caller, who is behind
     * AdminResolver and is the person the unpublished states exist for.
     */
    @Override
    @Transactional(readOnly = true)
    public EventResponse getEventForAdmin(Long eventId) {
        return toEventResponse(eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId)));
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

    /**
     * The organiser's Telegram handle and Facebook page, from their most recent
     * organiser application - not organizer_profile.telegram_chat_id, which is
     * the bot's numeric chat id, not a human-readable handle to link to.
     *
     * <p>Only ever called for Audience.ADMIN: an organiser has no use for a
     * link back to their own contact details on their own event.
     */
    private String[] organizerContact(Long organizerId) {
        var profile = organizerProfileRepository.findById(organizerId).orElse(null);
        if (profile == null) return new String[] { null, null };
        var latest = organizerApplicationRepository
                .findByUserIdOrderBySubmittedAtDesc(profile.getUserId())
                .stream()
                .findFirst()
                .orElse(null);
        if (latest == null) return new String[] { null, null };
        return new String[] { latest.getTelegramHandle(), latest.getFacebookUrl() };
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
        /*
         * Counted from the two lists already built above rather than with a
         * query of its own - the same arithmetic EventMapper does for
         * total_sold, and doing it twice is cheaper than a third round trip per
         * event in a list response.
         */
        int sold = zones.stream().mapToInt(z -> z.soldQty() == null ? 0 : z.soldQty()).sum()
                + seatClasses.stream().mapToInt(c -> (int) c.soldCount()).sum();

        String[] contact = audience == Audience.ADMIN
                ? organizerContact(event.getOrganizerId())
                : new String[] { null, null };

        return EventMapper.toEventResponse(
                event,
                seatClasses,
                zones,
                // Stored as delivery URLs since V18, so they go straight out.
                event.getCloudinaryImageId(),
                event.getCloudinaryBannerId(),
                actionsFor(event, audience, sold),
                stateMachine.isEditable(event.getStatus()),
                latestReview(event.getId()),
                contact[0],
                contact[1]);
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
    private List<EventTransition> actionsFor(Event event, Audience audience, int sold) {
        boolean finished = event.getStartsAt() != null && event.getStartsAt().isBefore(Instant.now());
        return stateMachine.availableTransitions(event.getStatus()).stream()
                .filter(audience == Audience.ADMIN
                        ? EventTransition::isAdminAction
                        : EventTransition::isOrganizerAction)
                /*
                 * TAKE_DOWN is the one transition both audiences share, and the
                 * organiser's copy only holds while nothing has sold - past that
                 * it is a refund decision and the service refuses it.
                 *
                 * Filtered here rather than left to the refusal because this is
                 * what the organiser's footer renders: offering a button that
                 * always comes back 409 is worse than not offering it, and the
                 * sold count is already to hand.
                 */
                /*
                 * TAKE_DOWN is the one transition both audiences share, and the
                 * organiser's copy holds while nothing has sold OR once the
                 * event is over - see takeDownOwnEvent for why finishing ends
                 * the refund argument. Filtered here rather than left to the
                 * refusal because this is what the organiser's footer renders,
                 * and a button that always answers 409 is worse than no button.
                 */
                /*
                 * TAKE_DOWN is the one transition both audiences share, and it
                 * drops out in two cases:
                 *   - the event has finished, for anyone: it already left the
                 *     catalogue, so there is nothing left to stop
                 *   - it has sold tickets, for the organiser: pulling a show
                 *     people hold tickets to is a refund decision
                 */
                .filter(t -> t != EventTransition.TAKE_DOWN || !finished)
                .filter(t -> !(audience == Audience.ORGANIZER
                        && t == EventTransition.TAKE_DOWN
                        && sold > 0))
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

        // Every review verb passes through here, so this is the one place that
        // has to announce them. NotificationListener decides which of them
        // anybody hears about - WITHDRAW, for instance, is the organiser's own
        // action on their own event and notifies no one.
        events.publishEvent(new NotificationEvents.EventReviewed(
                event.getId(), transition, message, review.getId()));

        return toEventResponse(event);
    }
}
