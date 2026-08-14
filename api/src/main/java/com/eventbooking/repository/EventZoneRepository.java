package com.eventbooking.repository;

import com.eventbooking.model.EventZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventZoneRepository extends JpaRepository<EventZone, Long> {
    List<EventZone> findAllByEventId(Long eventId);
    boolean existsByEventId(Long eventId);

}
