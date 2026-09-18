package com.eventbooking.security;

import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.exception.security.NotAnOrganizerException;
import com.eventbooking.exception.security.NotResourceOwnerException;
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
 *
 * <p>It is also the place the organiser check lives, and that check now reads
 * the role as well as the profile. See {@link #requireOrganizerId}.
 */
@Component
public class OrganizerResolver {

    private final OrganizerProfileRepository organizerProfileRepository;

    public OrganizerResolver(OrganizerProfileRepository organizerProfileRepository) {
        this.organizerProfileRepository = organizerProfileRepository;
    }

    /**
     * Translate and authorize in one call. The {@code orElseThrow} is the
     * organiser check: a CUSTOMER has no active profile, so there is no id to
     * return and no way to proceed.
     *
     * <p>{@code findActiveByUserId} and not {@code findByUserId}, and this is
     * the load-bearing detail of the whole demotion story. Demoting an organiser
     * keeps their profile row - the events and venues pointing at it have to
     * keep an owner - so "a profile exists" stopped being the same question as
     * "may this person publish". The role is now half the answer.
     *
     * <p>It matters most here because of where this is reached from. Only
     * {@code /api/v1/organizer/**} is role-gated in SecurityConfig;
     * {@code /api/v1/events/**} and {@code /api/v1/venue/**} fall through to
     * {@code anyRequest().authenticated()} and have no gate but this one. Read
     * the old way, a demoted organiser would keep full write access to both and
     * the demotion would be decorative.
     *
     * <p>One indexed SELECT per organiser write, same as before - the role is a
     * join, not a second round trip. Not cached: caching an identity is how a
     * revoked organiser keeps writing for the life of a cache entry.
     */
    public Long requireOrganizerId(Long actorUserId) {
        return organizerProfileRepository.findActiveByUserId(actorUserId)
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

    /*
     * requireOwnerOrShared used to live here: the same check, but treating a
     * null owner as "anyone may write". It backed V21's shared venues, and it
     * is gone because venues are private to the organiser who created them -
     * see V27. requireOwner is now the only ownership gate, which is the
     * property worth having: an authorization helper with a bypass in it is one
     * a future caller can reach for by accident.
     *
     * A venue with no owner therefore admits nobody, which is correct - there is
     * no organiser it belongs to. V27 retires any that were left.
     */
}
