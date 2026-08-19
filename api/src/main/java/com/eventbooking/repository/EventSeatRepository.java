package com.eventbooking.repository;

import com.eventbooking.dto.hold.HeldSeatItem;
import com.eventbooking.model.EventSeat;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EventSeatRepository extends JpaRepository<EventSeat, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from EventSeat s where s.holdId = :holdId order by s.id")
    List<EventSeat> findByHoldIdForUpdate(@Param("holdId") Long holdId);

    List<EventSeat> findByEventId(Long eventId);


    List<EventSeat> findByHoldId(Long holdId);
}
