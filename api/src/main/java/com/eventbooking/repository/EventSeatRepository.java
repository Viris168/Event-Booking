package com.eventbooking.repository;

import com.eventbooking.model.EventSeat;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventSeatRepository extends JpaRepository<EventSeat, Long> {
}
