package com.eventbooking.repository;

import com.eventbooking.model.ScanLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
