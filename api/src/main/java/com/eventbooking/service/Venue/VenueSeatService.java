package com.eventbooking.service.Venue;


import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.VenueSeat.VenueSeatMapResponse;

public interface VenueSeatService {
    VenueSeatMapResponse createVenueSeats(Long organizerId, Long venueId, CreateVenueSeatsRequest request);
    VenueSeatMapResponse getVenueSeatMap(Long venueId);
}