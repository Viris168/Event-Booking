package com.eventbooking.repository;

import com.eventbooking.model.EventSeat;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EventSeatRepository extends JpaRepository<EventSeat, Long> {

    /**
     * The seats a hold is sitting on, locked for update. Served by the partial
     * index idx_event_seat_hold. Used by the booking lane (issue #30) to move
     * seats from HELD to SOLD during checkout.
     *
     * Filters on the raw holdId column rather than an association, matching
     * how EventSeat maps hold_id.
     *
     * Deliberately no `join fetch s.seatClass`: Postgres applies FOR UPDATE to
     * every table in the FROM clause, so fetching the class here would also
     * row-lock seat_class and put checkout in contention with the catalog
     * lane. Callers touch seatClass lazily instead - a hold covers a handful
     * of seats, so the extra selects are cheaper than the lock surface.
     *
     * Ordered by id so two transactions grabbing overlapping seats always take
     * them in the same order and queue rather than deadlock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from EventSeat s where s.holdId = :holdId order by s.id")
    List<EventSeat> findByHoldIdForUpdate(@Param("holdId") Long holdId);
}
