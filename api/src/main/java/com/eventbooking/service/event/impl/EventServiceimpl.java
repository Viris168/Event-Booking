package com.eventbooking.service.event.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.catalog.EventStateMachine;
import com.eventbooking.catalog.error.EventImageNotFoundException;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventNotEditableException;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.InvalidEventStatusTransitionException;
import com.eventbooking.catalog.error.InventoryModeChangeBlockedException;
import com.eventbooking.catalog.error.InvalidEventScheduleException;
import com.eventbooking.catalog.error.InvalidSalesWindowException;
import com.eventbooking.catalog.error.VenueDisabledException;
import com.eventbooking.catalog.error.VenueNotFoundException;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventReviewResponse;
import com.eventbooking.repository.EventReviewRepository;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.model.AppUser;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.mapper.Event.EventMapper;
import com.eventbooking.mapper.Event.EventZoneMapper;
import com.eventbooking.mapper.SeatClass.SeatClassMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.service.Image.CloudinaryResponse;
import com.eventbooking.service.Image.CloudinaryService;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;

@Service
public class EventServiceimpl implements EventService {

    private final VenueRepository venueRepository;
    private final EventRepository eventRepository;
    private final SeatClassRepository seatClassRepository;
    private final EventZoneRepository eventZoneRepository;
    private final CloudinaryService cloudinaryService;
    private final OrganizerResolver organizerResolver;
    private final EventStateMachine stateMachine;
    private final EventReviewRepository eventReviewRepository;
    private final AppUserRepository appUserRepository;

    public EventServiceimpl(VenueRepository venueRepository, EventRepository eventRepository, SeatClassRepository seatClassRepository, EventZoneRepository eventZoneRepository, CloudinaryService cloudinaryService, OrganizerResolver organizerResolver, EventStateMachine stateMachine, EventReviewRepository eventReviewRepository, AppUserRepository appUserRepository) {
        this.organizerResolver = organizerResolver;
        this.stateMachine = stateMachine;
        this.eventReviewRepository = eventReviewRepository;
        this.appUserRepository = appUserRepository;
        this.venueRepository = venueRepository;
        this.eventRepository = eventRepository;
        this.seatClassRepository = seatClassRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.cloudinaryService = cloudinaryService;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EventResponse> listEvents(int page, int size) {
        return eventRepository.findAll(PageRequest.of(page, size))
                .map(this::toEventResponse);
    }

    @Override
    @Transactional
    public EventResponse createEvent(Long organizerId, CreateEventRequest request) {
        Venue venue = requireHostable(venueRepository.findById(request.venueId())
                .orElseThrow(() -> new VenueNotFoundException(request.venueId())));

        // You may only stage events at your own venue. Without this an
        // organiser could hang events off a competitor's venue, and the venue
        // owner would have no way to see it, let alone stop it.
        organizerResolver.requireOwner(organizerId, venue.getOrganizerId(), "venue", venue.getId());

        Event event = eventRepository.save(EventMapper.toEventEntity(request, venue, organizerId));
        // A freshly created event has no inventory, no images and no review
        // history yet, so the empty collections are the truth rather than a
        // shortcut - but its actions and editability still come from the state
        // machine, so the form can render its footer immediately.
        return EventMapper.toEventResponse(event, List.of(), List.of(), null, null,
                List.copyOf(stateMachine.availableTransitions(event.getStatus())),
                stateMachine.isEditable(event.getStatus()),
                null);
    }

    @Override
    @Transactional(readOnly = true)
    public EventResponse getEvent(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
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
            Venue venue = requireHostable(venueRepository.findById(request.venueId())
                    .orElseThrow(() -> new VenueNotFoundException(request.venueId())));
            organizerResolver.requireOwner(organizerId, venue.getOrganizerId(), "venue", venue.getId());
            event.setVenue(venue);
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

        // The @AssertTrue checks on UpdateEventRequest can only compare fields
        // that arrived together: send salesCloseAt alone and startsAt is null
        // there, so the rule passes vacuously and the DB CHECK becomes the
        // first thing to notice - as a raw 23514 the translator has no case
        // for, i.e. a 500. Re-check against the merged entity, where every
        // value is known.
        validateSchedule(event);
        eventRepository.save(event);

        return toEventResponse(event);
    }

    @Override
    @Transactional
    public EventResponse publishEvent(Long organizerId, Long eventId) {
        Event event = requireOwnedEvent(organizerId, eventId);

        // Was: any DRAFT could be published, which made the whole review step
        // optional - an organiser could skip straight past it on their own
        // event. The state machine allows PUBLISH only out of APPROVED, so
        // review is now the only route to being on sale.
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

        // Was: anything that was not already TAKEN_DOWN, which included DRAFT
        // and now would include PENDING_REVIEW - taking down an event that was
        // never on sale, and pushing a queued one into a terminal state behind
        // the reviewer's back. Takedown is a post-publication action, so
        // PUBLISHED is its only legal source.
        event.setStatus(stateMachine.requireTransition(
                event.getStatus(), EventTransition.TAKE_DOWN));
        eventRepository.save(event);
        return toEventResponse(event);
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


    /**
     * Put an image in one of the event's two slots, replacing whatever was
     * there. The Cloudinary upload runs inside the transaction: it is a network
     * call and does hold a connection for its duration, but the alternative -
     * uploading first and saving after - detaches the event and breaks the lazy
     * venue this method has to read back. Uploads are an organiser action, not
     * a ticket-buyer one, so the connection is not on the hot path.
     */
    @Override
    @Transactional
    public EventResponse uploadImage(Long organizerId, Long eventId, ImageRole role, MultipartFile file) {
        Event event = requireOwnedEvent(organizerId, eventId);

        // Read before the upload: once the column is overwritten there is no
        // record of the old public id, and the file behind it is unreachable.
        String replaced = currentPublicId(event, role);

        CloudinaryResponse uploaded = cloudinaryService.upload(file, file.getOriginalFilename());
        writePublicId(eventId, role, uploaded.publicId());

        // Only after the new id is safely stored. A delete first would lose the
        // old image with nothing to show in its place if the upload failed.
        if (replaced != null && !replaced.equals(uploaded.publicId())) {
            cloudinaryService.destroy(replaced);
        }

        return reloadResponse(eventId);
    }

    @Override
    @Transactional
    public EventResponse deleteImage(Long organizerId, Long eventId, ImageRole role) {
        Event event = requireOwnedEvent(organizerId, eventId);

        String publicId = currentPublicId(event, role);
        if (publicId == null) {
            throw new EventImageNotFoundException(eventId, role);
        }

        writePublicId(eventId, role, null);
        cloudinaryService.destroy(publicId);

        return reloadResponse(eventId);
    }

    private static String currentPublicId(Event event, ImageRole role) {
        return role == ImageRole.BANNER ? event.getCloudinaryBannerId() : event.getCloudinaryImageId();
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

    /**
     * The bulk update above bypasses the persistence context and clears it, so
     * the event loaded earlier is now both stale and detached. Read it again:
     * the response has to carry whatever the other slot holds right now, which
     * may have been written by a request running alongside this one.
     */
    private EventResponse reloadResponse(Long eventId) {
        return toEventResponse(eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId)));
    }

    private EventResponse toEventResponse(Event event) {
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
                cloudinaryService.urlFor(event.getCloudinaryImageId()),
                cloudinaryService.urlFor(event.getCloudinaryBannerId()),
                List.copyOf(stateMachine.availableTransitions(event.getStatus())),
                stateMachine.isEditable(event.getStatus()),
                latestReview(event.getId()));
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
}
