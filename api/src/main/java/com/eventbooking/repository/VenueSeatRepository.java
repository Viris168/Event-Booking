package com.eventbooking.repository;

import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VenueSeatRepository extends JpaRepository<VenueSeat, Long> {
    List<VenueSeat> findByVenueId(Long venueId);

    VenueSeat findByVenue(Venue venue);
}
