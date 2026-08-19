package com.eventbooking.mapper.Venue;

import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.VenueSeat.VenueSeatResponse;
import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class VenueSeatMapper {

    public static List<VenueSeat> toVenueSeat(CreateVenueSeatsRequest createVenueSeatsRequest, Venue venue) {
        return createVenueSeatsRequest.seats().stream()
                .map(f -> VenueSeat.builder()
                        .venue(venue)
                        .sectionLabel(f.sectionLabel())
                        .rowLabel(f.rowLabel())
                        .seatNumber(f.seatNumber())
                        .posX(f.posX())
                        .posY(f.posY())
                        .build()
                )
                .toList();
    }

    public static VenueSeatResponse toVenueSeatResponse(VenueSeat venueSeat) {
        return new VenueSeatResponse(
                venueSeat.getId(),
                venueSeat.getVenue().getId(),
                venueSeat.getSectionLabel(),
                venueSeat.getRowLabel(),
                venueSeat.getSeatNumber(),
                venueSeat.getPosX(),
                venueSeat.getPosY()
        );
    }
}
