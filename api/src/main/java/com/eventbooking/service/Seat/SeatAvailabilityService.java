package com.eventbooking.service.Seat;


import com.eventbooking.dto.seatclass.SeatAvailabilityResponse;

import java.util.List;

public interface SeatAvailabilityService {

    List<SeatAvailabilityResponse> getSeatMapAvailability(Long eventId);

}