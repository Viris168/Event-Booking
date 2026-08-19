package com.eventbooking.repository;

import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueRepository extends JpaRepository<Venue,Long> {

    Venue findByEvent(Event event);
}
