package com.eventbooking.repository;

import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.model.OrganizerApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrganizerApplicationRepository extends JpaRepository<OrganizerApplication, Long> {

    /**
     * The duplicate-submit guard. Optional rather than a bare entity because
     * the empty case is the normal one - most callers have never applied - and
     * a null-returning finder is how that turns into an NPE at the call site.
     *
     * <p>Backed by {@code uq_organizer_application_pending}, the partial unique
     * index that makes at most one row possible here.
     */
    Optional<OrganizerApplication> findByUserIdAndStatus(Long userId, OrganizerApplicationStatus status);

    /**
     * One applicant's own history, newest first. A list, not a single row: a
     * rejected applicant may apply again, which is why that index is partial.
     *
     * <p>Backed by {@code idx_organizer_application_user}.
     */
    List<OrganizerApplication> findByUserIdOrderBySubmittedAtDesc(Long userId);

    /**
     * The admin queue. Ascending: waiting longest is reviewed first.
     *
     * <p>Backed by {@code idx_organizer_application_pending}, which is partial
     * on {@code status = 'PENDING'} - the only status this is ever called with.
     */
    List<OrganizerApplication> findByStatusOrderBySubmittedAtAsc(OrganizerApplicationStatus status);

}
