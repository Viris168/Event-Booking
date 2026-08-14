package com.eventbooking.mapper.Event;

import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import org.springframework.stereotype.Component;

@Component
public class EventZoneMapper {
    public static EventZone toEventZone(Event event, CreateEventZoneRequest createEventZoneRequest) {
        return EventZone.builder()
                .event(event)
                .nameEn(createEventZoneRequest.nameEn())
                .nameKm(createEventZoneRequest.nameKm())
                .priceUsdCents(createEventZoneRequest.priceUsdCents())
                .capacity(createEventZoneRequest.capacity())
                .build();
    }

    public static EventZoneResponse toEventZoneResponse(EventZone eventZone) {
        int remainingQty = eventZone.getCapacity()
                - eventZone.getHeldQty()
                - eventZone.getSoldQty();
        return new EventZoneResponse(
                eventZone.getId(),
                eventZone.getEvent().getId(),
                eventZone.getNameEn(),
                eventZone.getNameKm(),
                eventZone.getPriceUsdCents(),
                eventZone.getCapacity(),
                eventZone.getHeldQty(),
                eventZone.getSoldQty(),
                remainingQty,
                eventZone.getVersion()
        );
    }
}
