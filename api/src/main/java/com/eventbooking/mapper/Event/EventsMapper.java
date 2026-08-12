package com.eventbooking.mapper.Event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.VenueRepository;
import org.springframework.stereotype.Component;

@Component
public class EventsMapper {

    private final VenueRepository venueRepo;

    public EventsMapper(VenueRepository venueRepo) {
        this.venueRepo = venueRepo;
    }

    public Event toEventEntity(CreateEventRequest createEventRequest) {

        Venue v = venueRepo.findById(createEventRequest.venueId())
                .orElseThrow(() -> new IllegalArgumentException("Venue not found: " + createEventRequest.venueId()));

        return Event.builder()
                .organizerId(createEventRequest.organizerId())
                .venue(v)
                .inventoryMode(createEventRequest.inventoryMode())
                .slug(createEventRequest.slug())
                .titleEn(createEventRequest.titleEn())
                .titleKm(createEventRequest.titleKm())
                .descriptionEn(createEventRequest.descriptionEn() != null ? createEventRequest.descriptionEn() : "")
                .descriptionKm(createEventRequest.descriptionKm() != null ? createEventRequest.descriptionKm() : "")
                .status(EventStatus.DRAFT)
                .startsAt(createEventRequest.startsAt())
                .doorsOpenAt(createEventRequest.doorsOpenAt())
                .salesOpenAt(createEventRequest.salesOpenAt())
                .salesCloseAt(createEventRequest.salesCloseAt())
                .build();
    }


}
