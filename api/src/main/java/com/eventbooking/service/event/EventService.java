package com.eventbooking.service.event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.EventReviewResponse;
import com.eventbooking.dto.event.EventSearchCriteria;
import com.eventbooking.dto.event.UpdateEventRequest;
import org.springframework.data.domain.Page;

import java.util.List;
import org.springframework.web.multipart.MultipartFile;


public interface EventService {

    // Reads are public - the catalogue is the product. Writes take the
    // caller's resolved organizer_profile id as their first argument and
    // refuse rows owned by anyone else. takeDownEvent is the exception: it is
    // a moderation action, so it is not the organiser's to authorize.

    /** The public catalogue. Browsing is a search with nothing filled in. */
    Page<EventResponse> listEvents(EventSearchCriteria criteria, int page, int size);
    EventResponse getEvent(Long eventId);
    void verifyEventIsOnSale(Long eventId);

    EventResponse createEvent(Long organizerId, CreateEventRequest request);
    EventResponse updateEvent(Long organizerId, Long eventId, UpdateEventRequest request);
    EventResponse publishEvent(Long organizerId, Long eventId);
    EventResponse uploadImage(Long organizerId, Long eventId, ImageRole role, MultipartFile file);
    EventResponse deleteImage(Long organizerId, Long eventId, ImageRole role);

    EventResponse takeDownEvent(Long eventId);

    /**
     * Organiser: pull their own listing, but only while nothing has sold.
     *
     * <p>Once a ticket exists the action becomes a refund decision, and
     * {@link #takeDownEvent} - the admin's - is the only one left.
     */
    EventResponse takeDownOwnEvent(Long organizerId, Long eventId);

    /** Admin: put a taken-down event back on sale. The undo for takeDownEvent. */
    EventResponse restoreEvent(Long eventId);

    /**
     * Admin: the same edit an organiser makes, on an event they do not own.
     *
     * <p>Takes an app_user id rather than an organizer_profile id, because an
     * admin has no profile - the id is for the log line, not for a check.
     */
    EventResponse updateEventAsAdmin(Long adminUserId, Long eventId, UpdateEventRequest request);

    /** Admin: one event in any status, past the public visibility rule. */
    EventResponse getEventForAdmin(Long eventId);

    EventResponse submitForReview(Long organizerId, Long eventId, Long actorUserId);
    EventResponse withdrawFromReview(Long organizerId, Long eventId, Long actorUserId);
    EventResponse approve(Long adminUserId, Long eventId);
    EventResponse reject(Long adminUserId, Long eventId, String message);
    EventResponse requestChanges(Long adminUserId, Long eventId, String message);

    /** Every decision on this event, oldest first, each with what changed since the previous one. */
    List<EventReviewResponse> getReviewHistory(Long eventId);
    List<EventResponse> listForOrganizer(Long organizerId, EventStatus status);

    /**
     * The moderation queue: every event in one status, oldest submission first.
     *
     * <p>Not a variant of {@link #listEvents}. That one is the public catalogue
     * and answers "what can a customer browse"; this answers "what is waiting
     * for an admin", which includes rows no customer may see. Two questions,
     * two methods, and only this one sits behind AdminResolver.
     */
    Page<EventResponse> listForReview(EventStatus status, int page, int size);
}
