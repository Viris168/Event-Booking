package com.eventbooking.repository;

import com.eventbooking.model.Venue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VenueRepository extends JpaRepository<Venue,Long> {

    /**
     * The venue list as a catalogue: what an organiser can still schedule
     * against. deactivateVenue is a soft delete, so findAll() keeps handing
     * back venues that were deliberately retired - callers then have to
     * remember to filter, and the one that forgot was every caller.
     *
     * <p>Lookup by id deliberately does NOT filter. A disabled venue is still
     * the venue of every event already booked there, and those pages have to
     * render; VenueResponse carries isDisabled so the client can say so.
     */
    List<Venue> findAllByIsDisabledFalse();
}
