package com.eventbooking.security;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.model.Event;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.security.error.NotResourceOwnerException;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import org.springframework.stereotype.Component;

/**
 * Who may read an event's contents.
 *
 * <p>{@code EventServiceimpl.getEvent} has always refused to serve an event that
 * is not publicly visible, for the reason written there: ids are sequential, so
 * a filtered list alone still lets anyone walk /events/1, /events/2 and read the
 * drafts. That rule covered the event row and nothing else - its zones, seat
 * classes, seat map and availability were each reachable on their own path, and
 * each answered for a draft exactly as it would for a published event. The
 * event was hidden; its name, prices and capacities were not.
 *
 * <p>So the same rule lives here once, and the child reads call it:
 *
 * <ul>
 *   <li><b>Publicly visible</b> - anyone, signed in or not.</li>
 *   <li><b>Not publicly visible</b> - only the organiser who owns it, or a
 *       platform admin. Everyone else gets the 404 the event itself gives.</li>
 * </ul>
 *
 * <p>404 rather than 403, matching {@code getEvent}: a 403 confirms the row
 * exists, which is the one bit a caller with no business knowing about an
 * unpublished event should not get.
 *
 * <p>The owner branch is not a courtesy. The organiser's own editing screens
 * read these very endpoints while an event is still a draft, and a guard that
 * only asked "is it published" would lock them out of their own work.
 */
@Component
public class EventVisibilityGuard {

    private final EventRepository eventRepository;
    private final EventZoneRepository eventZoneRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final AppUserRepository appUserRepository;

    public EventVisibilityGuard(EventRepository eventRepository,
                                EventZoneRepository eventZoneRepository,
                                OrganizerProfileRepository organizerProfileRepository,
                                AppUserRepository appUserRepository) {
        this.eventRepository = eventRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.appUserRepository = appUserRepository;
    }

    /**
     * The same rule for a path that names a zone rather than its event -
     * {@code /zone/{id}/availability}, whose response does not carry an event id
     * to check against.
     */
    public void requireZoneReadable(Long zoneId, Long actorUserId) {
        Long eventId = eventZoneRepository.findById(zoneId)
                .map(zone -> zone.getEvent().getId())
                .orElseThrow(() -> new EventZoneNotFoundException(zoneId));
        requireReadable(eventId, actorUserId);
    }

    /**
     * @param actorUserId the caller, or {@code null} for an anonymous request -
     *                    these endpoints are in {@code PUBLIC_GETS}, so null is
     *                    an ordinary case rather than an error
     * @throws EventNotFoundException if the event is absent, or hidden from this
     *                                caller
     */
    public Event requireReadable(Long eventId, Long actorUserId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        if (event.getStatus().isPubliclyVisible()) {
            return event;
        }
        if (actorUserId != null && (isOwner(event, actorUserId) || isPlatformAdmin(actorUserId))) {
            return event;
        }
        throw new EventNotFoundException(eventId);
    }

    /**
     * Confirms a child row was reached through its own parent.
     *
     * <p>{@code /events/{eventId}/seat-class/{seatClassId}} looked the child up
     * by its own id and never compared the two, so
     * {@code /events/1/seat-class/9} served event 6's seat class and
     * {@code /events/99/...} served it under a parent that does not exist. That
     * turns every id-scoped guard on the parent into a formality - including the
     * one directly above.
     *
     * @throws EventNotFoundException named for the parent the caller asked for,
     *                                which is the thing that is genuinely not
     *                                there in the shape they described
     */
    public void requireBelongsToEvent(Long eventId, Long childEventId) {
        if (childEventId == null || !childEventId.equals(eventId)) {
            throw new EventNotFoundException(eventId);
        }
    }

    /**
     * Stricter than {@link #requireReadable}: publication does not make a
     * moderation history public. Only the organiser who owns the event and
     * platform admins may read it, whatever the event's status.
     *
     * <p>403 rather than 404 here, unlike the reads above. For a PUBLISHED event
     * the row's existence is already public knowledge, so there is nothing left
     * to conceal by pretending it is missing - and "you may not read this" is
     * the truthful answer.
     */
    public void requireReviewReadable(Long eventId, Long actorUserId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        if (!isOwner(event, actorUserId) && !isPlatformAdmin(actorUserId)) {
            throw new NotResourceOwnerException("event", eventId);
        }
    }

    private boolean isOwner(Event event, Long actorUserId) {
        return organizerProfileRepository.findByUserId(actorUserId)
                .map(profile -> profile.getId().equals(event.getOrganizerId()))
                .orElse(false);
    }

    private boolean isPlatformAdmin(Long actorUserId) {
        return appUserRepository.findById(actorUserId)
                .map(u -> u.getRole() == Role.PLATFORM_ADMIN && !Boolean.TRUE.equals(u.getIsDisabled()))
                .orElse(false);
    }
}
