package com.eventbooking.repository;

import com.eventbooking.model.ScanLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScanLogRepository extends JpaRepository<ScanLog, Long> {

    /** What happened at this event's doors, newest first. */
    Page<ScanLog> findByEventIdOrderByAtDesc(Long eventId, Pageable pageable);

    /**
     * The same, refusals only - which is the view worth looking at. A wall of
     * VALID rows tells an organiser nothing they cannot get from ticket counts.
     */
    Page<ScanLog> findByEventIdAndOutcomeNotOrderByAtDesc(Long eventId, String outcome, Pageable pageable);

    /** How many codes were turned away here - the number worth an eyebrow. */
    long countByEventIdAndOutcomeNot(Long eventId, String outcome);

    /**
     * Clear this event's gate log, ahead of deleting the event itself.
     *
     * <p>{@code scan_log.event_id} has no ON DELETE clause, so these rows have
     * to go first or the delete fails. They can exist on an event with no
     * bookings at all: a refused scan writes a row and no ticket, which is the
     * whole reason V16 created this table.
     */
    @Modifying
    @Query("delete from ScanLog s where s.eventId = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);
}
