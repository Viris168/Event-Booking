package com.eventbooking.service.Seat.impl;

import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.dto.seatclass.SeatAvailabilityResponse;
import com.eventbooking.model.EventSeat;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.service.Seat.SeatAvailabilityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SeatAvailabilityServiceimpl implements SeatAvailabilityService {

    private final EventSeatRepository eventSeatRepository;
    private final EventRepository eventRepository;

    public SeatAvailabilityServiceimpl(EventSeatRepository eventSeatRepository, EventRepository eventRepository) {
        this.eventSeatRepository = eventSeatRepository;
        this.eventRepository = eventRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<SeatAvailabilityResponse> getSeatMapAvailability(Long eventId) {


        if (!eventRepository.existsById(eventId)) {
            throw new EventNotFoundException(eventId);
        }

        List<EventSeat> seatAvailabilityResponses = eventSeatRepository.findByEventId(eventId);

        return seatAvailabilityResponses.stream()
                .map( f -> new SeatAvailabilityResponse(
                        f.getId(),
                        f.getVenueSeat().getSectionLabel(),
                        f.getVenueSeat().getRowLabel(),
                        f.getVenueSeat().getSeatNumber(),
                        f.getSeatClass().getId(),
                        f.getSeatClass().getNameEn(),
                        f.getSeatClass().getPriceUsdCents(),
                        f.getStatus().name()
                ))
                .toList();
    }
}