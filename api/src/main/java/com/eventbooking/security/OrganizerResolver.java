package com.eventbooking.security;

import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.security.error.NotAnOrganizerException;
import com.eventbooking.security.error.NotResourceOwnerException;
import org.springframework.stereotype.Component;

/**
 * The single place where a caller's identity becomes an ownership id.
 *
 * <p>Callers identify themselves with an {@code app_user.id} (today the
 * {@code X-User-Id} header, later the JWT subject). Every ownership column -
 * {@code venue.organizer_id}, {@code event.organizer_id} - is an
 * {@code organizer_profile.id}. Two different id spaces that look identical on
 * the wire, which is exactly the kind of confusion that should exist in one
 * function rather than at thirty call sites.
 *
 * <p>Keeping it here also means the JWT swap is a one-line change: the header
 * stops being the source of {@code actorUserId} and the principal starts, and
 * nothing below the controllers notices.
 */
@Component
public class OrganizerResolver {

    private final OrganizerProfileRepository organizerProfileRepository;

    public OrganizerResolver(OrganizerProfileRepository organizerProfileRepository) {
        this.organizerProfileRepository = organizerProfileRepository;
    }

    /**
     * Translate and authorize in one call. The {@code orElseThrow} is the
     * organiser check: a CUSTOMER has no profile row, so there is no id to
     * return and no way to proceed.
     *
     * <p>One extra indexed SELECT per organiser write. Not cached: caching an
     * identity before real authentication exists is how a revoked organiser
     * keeps writing for the life of a cache entry.
     */
    public Long requireOrganizerId(Long actorUserId) {
        return organizerProfileRepository.findByUserId(actorUserId)
                .orElseThrow(() -> new NotAnOrganizerException(actorUserId))
                .getId();
    }

    /**
     * Ownership gate for writes on rows that already exist. Kept next to the
     * resolver so both halves of "who are you" and "is this yours" read as one
     * rule.
     */
    public void requireOwner(Long organizerId, Long rowOrganizerId, String resource, Long resourceId) {
        if (!organizerId.equals(rowOrganizerId)) {
            throw new NotResourceOwnerException(resource, resourceId);
        }
    }

    /**
     * Ownership gate for rows that are allowed to have no owner at all.
     *
     * <p>A {@code null} owner means the row belongs to the platform rather than
     * to a person - today only {@code venue.organizer_id}, where it marks a
     * public hall any organiser may host at and maintain. Every organiser passes
     * that case; an owned row still admits only its owner.
     *
     * <p>Separate from {@link #requireOwner} on purpose. Teaching that method to
     * treat null as "anyone may write" would silently loosen every other
     * ownership check the moment some unrelated column went nullable - and the
     * one thing an authorization helper must not do is get quietly weaker.
     */
    public void requireOwnerOrShared(Long organizerId, Long rowOrganizerId, String resource, Long resourceId) {
        if (rowOrganizerId == null) {
            return;
        }
        requireOwner(organizerId, rowOrganizerId, resource, resourceId);
    }
}
