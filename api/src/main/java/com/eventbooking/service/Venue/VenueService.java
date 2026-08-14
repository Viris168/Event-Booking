package com.eventbooking.service.Venue;

import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;

import java.util.UUID;

public interface VenueService {
    VenueResponse createVenue(CreateVenueRequest request);
    VenueResponse getVenue(Long venueId);
    VenueResponse updateVenue(Long venueId, UpdateVenueRequest request);
    void deactivateVenue(Long venueId);
}
