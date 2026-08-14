package com.eventbooking.mapper.Event;

import com.eventbooking.catalog.error.SeatClassNotFoundException;
import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.model.*;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.repository.VenueRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;


@Component

public class EventSeatMapper {


    public static List<EventSeat> toEventSeats(Event event, SeatClass seatClass, List<VenueSeat> venueSeats) {
        return venueSeats.stream()
                .map(venueSeat -> EventSeat.builder()
                        .event(event)
                        .seatClass(seatClass)
                        .venueSeat(venueSeat)
                        .build()
                )
                .toList();
    }

}
