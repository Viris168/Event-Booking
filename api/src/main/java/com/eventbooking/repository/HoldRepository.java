package com.eventbooking.repository;

<<<<<<< HEAD
import com.eventbooking.model.Hold;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HoldRepository extends JpaRepository<Hold,Long> {
=======
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.model.Hold;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * Minimal hold access needed by the booking lane (issue #30). The inventory
 * lane owns holds proper - SeatHoldService / ZoneHoldService and the create /
 * extend / release paths - so expect this interface to grow there rather than
 * here.
 */
public interface HoldRepository extends JpaRepository<Hold, Long> {

    /**
     * Row-locks the hold for the whole checkout transaction. Without this,
     * two concurrent conversions of the same hold both read status = ACTIVE
     * and race to create a booking; the second is then rejected by the
     * booking.hold_id UNIQUE constraint as a raw 23505 instead of resolving
     * cleanly.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select h from Hold h where h.id = :id")
    Optional<Hold> findByIdForUpdate(@Param("id") Long id);

    Optional<Hold> findByEventIdAndUserIdAndStatus(Long eventId, Long userId, HoldStatus status);
>>>>>>> origin/winner-dev
}
