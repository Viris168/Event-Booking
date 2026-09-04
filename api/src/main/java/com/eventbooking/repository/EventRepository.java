package com.eventbooking.repository;

import com.eventbooking.model.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
    @Query("UPDATE Event e SET e.cloudinaryImageId = :publicId WHERE e.id = :eventId")
    int updateCoverImageId(@Param("eventId") Long eventId, @Param("publicId") String publicId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Event e SET e.cloudinaryBannerId = :publicId WHERE e.id = :eventId")
    int updateBannerImageId(@Param("eventId") Long eventId, @Param("publicId") String publicId);
}
