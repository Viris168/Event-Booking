package com.eventbooking.mapper.Event;

import com.eventbooking.catalog.error.SeatClassNotFoundException;
import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.repository.VenueRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;


@Component

public class EventSeatMapper {

    private final SeatClassRepository seatClassRepository;
    private final VenueRepository venueRepository;

    public EventSeatMapper(SeatClassRepository seatClassRepository, VenueRepository venueRepository) {
        this.seatClassRepository = seatClassRepository;
        this.venueRepository = venueRepository;
    }


    public List<EventSeat> mapToEventSeatEntity(GenerateEventSeatsRequest generateEventSeatsRequest) {

        Long id = generateEventSeatsRequest.seatClassId();

        SeatClass seatClass = (SeatClass) seatClassRepository.findById(id)
                .orElseThrow(() -> new SeatClassNotFoundException(id));

        List<Long> venueSeatIdsseatIds = generateEventSeatsRequest.venueSeatIds();

        List<EventSeat> eventSeats = venueSeatIdsseatIds.stream()
                .map(seatIds -> EventSeat.builder()
                        .seatClass(seatClass)
                        .venueSeatId(seatIds)
                        .build()
                )
                .toList();

        return eventSeats;

    }

}
