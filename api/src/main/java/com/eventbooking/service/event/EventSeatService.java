package com.eventbooking.service.event;


import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.dto.eventseat.SeatMapResponse;

public interface EventSeatService {
    SeatMapResponse generateEventSeats(Long eventId, GenerateEventSeatsRequest request);
    SeatMapResponse getSeatMap(Long eventId);
}