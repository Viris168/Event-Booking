package com.eventbooking.repository;

import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VenueSeatRepository extends JpaRepository<VenueSeat, Long> {
    List<VenueSeat> findByVenueId(Long venueId);

    /**
     * One section of a venue's map.
     *
     * <p>Case-sensitive, matching UNIQUE (venue_id, section_label, row_label,
     * seat_number): 'VIP' and 'vip' are two sections to the database, so a
     * delete that matched loosely could remove a section the caller did not name.
     */
    List<VenueSeat> findByVenueIdAndSectionLabel(Long venueId, String sectionLabel);

    VenueSeat findByVenue(Venue venue);
}
