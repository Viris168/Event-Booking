package com.eventbooking.repository;

import com.eventbooking.model.EventZone;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EventZoneRepository extends JpaRepository<EventZone, Long> {
    List<EventZone> findAllByEventId(Long eventId);
    boolean existsByEventId(Long eventId);

    /**
     * Row-locks the zones a checkout is about to move from held_qty to
     * sold_qty. EventZone carries an @Version, but optimistic locking would
     * surface as a retryable 503 under normal checkout contention; taking the
     * row lock up front makes the counter shuffle wait instead of fail.
     *
     * Ordered by id so two transactions touching an overlapping set of zones
     * always grab them in the same order, which is what stops them deadlocking.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select z from EventZone z where z.id in :ids order by z.id")
    List<EventZone> findAllByIdForUpdate(@Param("ids") List<Long> ids);
}

