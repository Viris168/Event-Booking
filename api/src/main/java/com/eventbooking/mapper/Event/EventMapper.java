package com.eventbooking.mapper.Event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.Venue;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class EventMapper {


    public static Event toEventEntity(CreateEventRequest createEventRequest, Venue venue) {

        return Event.builder()
                .organizerId(createEventRequest.organizerId())
                .venue(venue)
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

    public static EventResponse  toEventResponse(Event event, List<SeatClassResponse> seatClasses, List<EventZoneResponse>  eventZones) {


        VenueResponse v = new VenueResponse(
            event.getVenue().getId(),
            event.getVenue().getOrganizerId(),
            event.getVenue().getNameEn(),
            event.getVenue().getNameKm(),
            event.getVenue().getProvinceCode(),
            event.getVenue().getKhanDistrict(),
            event.getVenue().getSangkatCommune(),
            event.getVenue().getStreetAddress(),
            event.getVenue().getLat(),
            event.getVenue().getLng(),
            event.getVenue().getCreatedAt(),
            event.getVenue().getIsDisabled()
        );

        int totalCapacity = 0;
        int totalSold = 0;
        int totalHeld = 0;
        
        for(var z : eventZones){
            totalCapacity += z.capacity();
            totalSold += z.soldQty();
            totalHeld += z.heldQty();
        }

        return new EventResponse(
                event.getId(),
                event.getOrganizerId(),
                v,
                event.getInventoryMode(),
                event.getSlug(),
                event.getTitleEn(),
                event.getTitleKm(),
                event.getDescriptionEn(),
                event.getDescriptionKm(),
                event.getStatus(),
                event.getStartsAt(),
                event.getDoorsOpenAt(),
                event.getSalesOpenAt(),
                event.getSalesCloseAt(),
                event.getCreatedAt(),
                seatClasses,
                eventZones,
                totalCapacity,
                totalSold,
                totalHeld
        );
    }




}
