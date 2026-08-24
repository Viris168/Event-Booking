package com.eventbooking.mapper.Event;

import com.eventbooking.model.*;
import org.springframework.stereotype.Component;

import java.util.List;


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
