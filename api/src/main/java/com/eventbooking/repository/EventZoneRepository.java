package com.eventbooking.repository;

import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventZoneRepository extends JpaRepository<EventZone, Long> {
    EventZone findByEvent(Event event);

    List<EventZone> findAllByEventId(Long eventId);
}
