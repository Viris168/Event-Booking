package com.eventbooking.mapper.Venue;

import com.eventbooking.catalog.error.VenueNotFoundException;
import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.repository.VenueSeatRepository;
import jakarta.validation.constraints.NotNull;
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
}
