package com.eventbooking.repository;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.model.Event;
import com.eventbooking.model.Hold;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
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

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT h
        FROM Hold h
        WHERE h.id = :holdId
          AND h.user.id = :userId
        """)
    Optional<Hold> findOwnedByIdForUpdate(
            @Param("holdId") Long holdId,
            @Param("userId") Long userId
    );

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

    Optional<Hold> findByIdAndUser_Id(Long holdId, Long userId);

    /**
     * The caller's still-ACTIVE holds, newest first. The partial unique
     * index uq_hold_one_active_per_user_event guarantees at most one row
     * per event, but a user may hold seats for several events at once.
     */
    @Query("""
          SELECT h
          FROM Hold h
          WHERE h.user.id = :userId
            AND h.status = :activeStatus
          ORDER BY h.createdAt DESC
          """)
    List<Hold> findActiveByUserId(
            @Param("userId") Long userId,
            @Param("activeStatus") HoldStatus activeStatus
    );

    Hold findByEvent(Event event);

    interface ZoneConsumed {
        Long getId();
        Long getConsumedQuantity();
    }

    @Query("""
        SELECT h.id
        FROM Hold h
        WHERE h.status = :activeStatus
          AND h.expiresAt <= :now
        ORDER BY h.id
        """)
    List<Long> findExpiredActiveHoldIds(
            @Param("now") Instant now,
            @Param("activeStatus") HoldStatus activeStatus
    );

    @Query("""
        SELECT DISTINCT h.id
        FROM Hold h
        JOIN h.zoneLines line
        WHERE line.eventZone.id = :zoneId
          AND h.status = :activeStatus
          AND h.expiresAt <= :now
        ORDER BY h.id
        """)
    List<Long> findExpiredActiveHoldIdsByZoneId(
            @Param("zoneId") Long zoneId,
            @Param("now") Instant now,
            @Param("activeStatus") HoldStatus activeStatus
    );

    @Modifying(flushAutomatically = true)
    @Query("""
      UPDATE Hold h
      SET h.status = :expiredStatus
      WHERE h.status = :activeStatus
        AND h.expiresAt <= :now
        AND EXISTS (
            SELECT 1
            FROM HoldZoneLine hz
            WHERE hz.hold = h
              AND hz.eventZone.id = :zoneId
        )
      """)
    int expireActiveHoldsForZone(
            @Param("zoneId") Long zoneId,
            @Param("now") Instant now,
            @Param("activeStatus") HoldStatus activeStatus,
            @Param("expiredStatus") HoldStatus expiredStatus
    );

    @Modifying(flushAutomatically = true)
    @Query("""
        UPDATE Hold h
        SET h.status = :expiredStatus
        WHERE h.status = :activeStatus
          AND h.expiresAt <= :now
        """)
    int expireAllActiveHolds(
            @Param("now") Instant now,
            @Param("activeStatus") HoldStatus activeStatus,
            @Param("expiredStatus") HoldStatus expiredStatus
    );

}
