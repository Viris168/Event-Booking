package com.eventbooking.repository;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.model.EventZone;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface EventZoneRepository extends JpaRepository<EventZone, Long> {
    List<EventZone> findAllByEventId(Long eventId);
    boolean existsByEventId(Long eventId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
      SELECT z FROM EventZone z WHERE z.id = :zoneId AND z.event.id = :eventId""")
    Optional<EventZone> findByIdAndEventIdForUpdate(
            @Param("zoneId") Long zoneId,
            @Param("eventId") Long eventId
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
      UPDATE EventZone z SET z.heldQty = z.heldQty + :qty, z.version = z.version + 1
      WHERE z.id = :zoneId
        AND z.event.id = :eventId
        AND z.version = :version
        AND z.heldQty + z.soldQty + :qty <= z.capacity
      """)
    int tryReserveQuantity(
            @Param("zoneId") Long zoneId,
            @Param("eventId") Long eventId,
            @Param("qty") int qty,
            @Param("version") Long version
    );

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
