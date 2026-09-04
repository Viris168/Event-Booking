package com.eventbooking.mapper.Event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class EventMapper {


    /**
     * @param organizerId resolved from the caller by OrganizerResolver, not read
     *                    off the request - the request no longer carries one.
     */
    public static Event toEventEntity(CreateEventRequest createEventRequest, Venue venue, Long organizerId) {

        return Event.builder()
                .organizerId(organizerId)
                .venue(venue)
                .inventoryMode(createEventRequest.inventoryMode())
                .slug(createEventRequest.slug())
                .titleEn(createEventRequest.titleEn())
                .titleKm(createEventRequest.titleKm())
                .descriptionEn(createEventRequest.descriptionEn() != null ? createEventRequest.descriptionEn() : "")
                .descriptionKm(createEventRequest.descriptionKm() != null ? createEventRequest.descriptionKm() : "")
                .category(createEventRequest.category() != null ? createEventRequest.category() : "MUSIC")
                .cover(createEventRequest.cover() != null ? createEventRequest.cover() : 1)
                .status(EventStatus.DRAFT)
                .startsAt(createEventRequest.startsAt())
                .doorsOpenAt(createEventRequest.doorsOpenAt())
                .salesOpenAt(createEventRequest.salesOpenAt())
                .salesCloseAt(createEventRequest.salesCloseAt())
                .build();
    }

    /**
     * @param coverImageUrl  derived from the stored public id by
     *                       CloudinaryService.urlFor - the mapper is static and
     *                       has no bean to call, so the caller resolves it.
     * @param bannerImageUrl same, for the banner slot. Either may be null when
     *                       the slot is empty.
     */
    public static EventResponse  toEventResponse(Event event, List<SeatClassResponse> seatClasses, List<EventZoneResponse>  eventZones,
                                                 String coverImageUrl, String bannerImageUrl) {


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

        // Every place at this event, whichever side of the inventory split it
        // sits on. Zones alone would under-report a SEATED or MIXED event by its
        // entire seat map - the capacity bar would show a sold-out tier against
        // a total that never counted it.
        int totalCapacity = 0;
        int totalSold = 0;
        int totalHeld = 0;

        for(var z : eventZones){
            totalCapacity += z.capacity();
            totalSold += z.soldQty();
            totalHeld += z.heldQty();
        }

        for(var c : seatClasses){
            totalCapacity += (int) c.seatCount();
            totalSold += (int) c.soldCount();
            totalHeld += (int) c.heldCount();
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
                event.getCategory(),
                event.getCover(),
                coverImageUrl,
                bannerImageUrl,
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
