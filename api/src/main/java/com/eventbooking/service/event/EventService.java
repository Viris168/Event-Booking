package com.eventbooking.service.event;

import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import org.springframework.data.domain.Page;
import org.springframework.web.multipart.MultipartFile;


public interface EventService {

    // Reads are public - the catalogue is the product. Writes take the
    // caller's resolved organizer_profile id as their first argument and
    // refuse rows owned by anyone else. takeDownEvent is the exception: it is
    // a moderation action, so it is not the organiser's to authorize.

    Page<EventResponse> listEvents(int page, int size);
    EventResponse getEvent(Long eventId);
    void verifyEventIsOnSale(Long eventId);

    EventResponse createEvent(Long organizerId, CreateEventRequest request);
    EventResponse updateEvent(Long organizerId, Long eventId, UpdateEventRequest request);
    EventResponse publishEvent(Long organizerId, Long eventId);
    EventResponse uploadImage(Long organizerId, Long eventId, ImageRole role, MultipartFile file);
    EventResponse deleteImage(Long organizerId, Long eventId, ImageRole role);

    EventResponse takeDownEvent(Long eventId);
}
