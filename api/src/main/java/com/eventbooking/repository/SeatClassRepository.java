package com.eventbooking.repository;

import com.eventbooking.model.EventZone;
import com.eventbooking.model.SeatClass;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SeatClassRepository extends JpaRepository<SeatClass, Long> {

    List<SeatClass> findAllByEventId(Long eventId);

}
