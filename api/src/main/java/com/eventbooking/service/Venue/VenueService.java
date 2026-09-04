package com.eventbooking.service.Venue;

import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
import java.util.List;

public interface VenueService {

    // Same split as EventService: anyone may read the venue catalogue, only
    // the owning organiser may write.

    VenueResponse getVenue(Long venueId);
    List<VenueResponse> getAllVenues();

    VenueResponse createVenue(Long organizerId, CreateVenueRequest request);
    VenueResponse updateVenue(Long organizerId, Long venueId, UpdateVenueRequest request);
    void deactivateVenue(Long organizerId, Long venueId);
}
