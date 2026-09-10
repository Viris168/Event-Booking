package com.eventbooking.repository;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.Collection;
import java.util.List;

public interface EventRepository extends JpaRepository<Event, Long> {

    /*
     * Image slots are written column by column, not through save().
     *
     * save() issues an UPDATE over every column of the row, built from the copy
     * of the event the transaction loaded. Two uploads in flight at once - a
     * cover and a banner, which is one click in the organiser form - both read
     * the row before either commits, so the second save writes back the first
     * one's stale column and that image silently disappears.
     *
     * These touch one column each, so the two uploads no longer overlap and
     * neither needs to know about the other. No version column and no retry:
     * the writes are genuinely independent.
     */

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Event e SET e.cloudinaryImageId = :url WHERE e.id = :eventId")
    int updateCoverImageId(@Param("eventId") Long eventId, @Param("url") String url);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Event e SET e.cloudinaryBannerId = :url WHERE e.id = :eventId")
    int updateBannerImageId(@Param("eventId") Long eventId, @Param("url") String url);

    /**
     * The public catalogue. Restricted by status because findAll() is what let
     * an unpublished draft onto the home page the moment it was created.
     */
    Page<Event> findByStatusIn(Collection<EventStatus> statuses, Pageable pageable);

    @Query("""
        select e from Event e
        where e.organizerId = :organizerId
        and (:status is null or e.status = :status)
        order by e.startsAt asc
        """)
    List<Event> findForOrganizer(@Param("organizerId") Long organizerId,
                                 @Param("status") EventStatus status);
}
