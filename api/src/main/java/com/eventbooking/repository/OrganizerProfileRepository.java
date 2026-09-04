package com.eventbooking.repository;

import com.eventbooking.model.OrganizerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OrganizerProfileRepository extends JpaRepository<OrganizerProfile, Long> {

    /**
     * The one lookup that converts a caller's {@code app_user.id} into the
     * {@code organizer_profile.id} that ownership columns are written in.
     *
     * <p>{@code Optional} rather than a list because {@code user_id} is UNIQUE
     * in V1: at most one row, and an empty result is meaningful - it is how a
     * CUSTOMER is told apart from an ORGANIZER. See OrganizerResolver.
     */
    Optional<OrganizerProfile> findByUserId(Long userId);
}
