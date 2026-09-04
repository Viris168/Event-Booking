package com.eventbooking.repository;

import com.eventbooking.model.EventReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EventReviewRepository extends JpaRepository<EventReview, Long> {

    /** Full history for one event, newest first. Backed by idx_event_review_event. */
    List<EventReview> findByEventIdOrderByCreatedAtDesc(Long eventId);

    /** The row the organiser's status banner renders. */
    Optional<EventReview> findFirstByEventIdOrderByCreatedAtDesc(Long eventId);
}
