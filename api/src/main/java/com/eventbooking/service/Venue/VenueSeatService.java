package com.eventbooking.service.Venue;


import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.VenueSeat.VenueSeatMapResponse;

public interface VenueSeatService {
    VenueSeatMapResponse createVenueSeats(CreateVenueSeatsRequest request);
    VenueSeatMapResponse getVenueSeatMap(Long venueId);
}