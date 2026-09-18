package com.eventbooking.repository;

import com.eventbooking.model.Venue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VenueRepository extends JpaRepository<Venue,Long> {

    /**
     * The venue list as a catalogue: what an organiser can still schedule
     * against. deactivateVenue is a soft delete, so findAll() keeps handing
     * back venues that were deliberately retired - callers then have to
     * remember to filter, and the one that forgot was every caller.
     *
     * <p>Lookup by id deliberately does NOT filter. A disabled venue is still
     * the venue of every event already booked there, and those pages have to
     * render; VenueResponse carries isDisabled so the client can say so.
     */
    List<Venue> findAllByIsDisabledFalse();

    /**
     * One organiser's venues - what their venue list and the event form's venue
     * picker are allowed to show.
     *
     * <p>Replaces {@link #findAllByIsDisabledFalse} on those two screens, which
     * returned every venue on the platform: an organiser could see, and pick,
     * buildings belonging to their competitors. Venues are private to the
     * organiser who created them.
     *
     * <p>A NULL owner matches nothing here, which is deliberate. Those are the
     * shared venues V21 introduced and V27 retired; there is no organiser they
     * belong to, so there is no list they belong in.
     */
    List<Venue> findAllByOrganizerIdAndIsDisabledFalse(Long organizerId);

    /*
     * countByOrganizerId used to live here as the other half of the demotion
     * guard in AdminUserService. Demotion no longer deletes the
     * organizer_profile row, so a venue's owner outlives its owner's role and
     * there is nothing to count.
     */
}
