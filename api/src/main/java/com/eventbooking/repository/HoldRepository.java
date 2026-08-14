package com.eventbooking.repository;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.model.Hold;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface HoldRepository extends JpaRepository<Hold, Long> {

    /**
     * Row-locks the hold for the whole checkout transaction. Without this,
     * two concurrent conversions of the same hold both read status = ACTIVE
     * and race to create a booking; the second is then rejected by the
     * booking.hold_id UNIQUE constraint as a raw 23505 instead of resolving
     * cleanly. Used by the booking lane (issue #30).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select h from Hold h where h.id = :id")
    Optional<Hold> findByIdForUpdate(@Param("id") Long id);

    @Query("""
          SELECT hz.eventZone.id AS id,
                 COALESCE(SUM(hz.qty), 0) AS consumedQuantity
          FROM HoldZoneLine hz
          WHERE hz.eventZone.event.id = :eventId
            AND (
                (hz.hold.status = :activeStatus
                 AND hz.hold.expiresAt > :now)
                OR hz.hold.status = :consumedStatus
            )
          GROUP BY hz.eventZone.id
          """)
    List<ZoneConsumed> sumConsumedQuantityByEvent(
            @Param("eventId") Long eventId,
            @Param("now") Instant now,
            @Param("activeStatus") HoldStatus activeStatus,
            @Param("consumedStatus") HoldStatus consumedStatus
    );

    @Query("""
          SELECT COALESCE(SUM(hz.qty), 0)
          FROM HoldZoneLine hz
          WHERE hz.eventZone.id = :zoneId
            AND (
                (hz.hold.status = :activeStatus
                 AND hz.hold.expiresAt > :now)
                OR hz.hold.status = :consumedStatus
            )
          """)
    Long sumConsumedQuantityByZoneId(
            @Param("zoneId") Long zoneId,
            @Param("now") Instant now,
            @Param("activeStatus") HoldStatus activeStatus,
            @Param("consumedStatus") HoldStatus consumedStatus
    );

    interface ZoneConsumed {
        Long getId();
        Long getConsumedQuantity();
    }
}
