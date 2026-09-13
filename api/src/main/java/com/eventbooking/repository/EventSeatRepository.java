package com.eventbooking.repository;

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

    /**
     * Seat counts per event, grouped by status, for every event at once.
     *
     * <p>The companion to EventZoneRepository.totalsByEvent: a SEATED or MIXED
     * event keeps part or all of its inventory here, and a moderation row that
     * counted only zones would report a sold-out seat map as zero capacity.
     *
     * <p>Returns {@code [eventId, status, count]} per row. BLOCKED seats are
     * included in the caller's capacity on purpose - they are places that
     * exist and are deliberately not for sale, which is what the bar shows.
     */
    @org.springframework.data.jpa.repository.Query("""
            select s.event.id, s.status, count(s)
            from EventSeat s
            group by s.event.id, s.status
            """)
    java.util.List<Object[]> statusCountsByEvent();
}
