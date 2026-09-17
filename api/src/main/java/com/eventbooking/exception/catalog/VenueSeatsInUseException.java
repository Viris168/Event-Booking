package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

import java.util.List;
import java.util.Map;

/**
 * The organiser asked to delete a seat section that events are already built on.
 *
 * <p>A {@code venue_seat} row is a chair in a building, and {@code event_seat}
 * rows point at it with a plain foreign key - no cascade, no null-out. Every
 * show that has ever been laid out in this venue holds those references, and
 * tickets reach back through them. Deleting underneath that would either fail
 * at the constraint with a raw 500 or, if the constraint were relaxed, take a
 * paying customer's seat away.
 *
 * <p>So the refusal names the events rather than the constraint: the organiser's
 * way out is to deal with those events first, and they cannot do that without
 * being told which ones they are.
 */
public class VenueSeatsInUseException extends ApiException {
    public VenueSeatsInUseException(String sectionLabel, List<Long> eventIds) {
        super(ErrorCode.VENUE_SEATS_IN_USE,
                "Section " + sectionLabel + " is in use by " + eventIds.size() + " event(s): "
                        + eventIds + ". Seats already laid out for an event cannot be removed from "
                        + "the venue - remove them from those events first.",
                false,
                Map.of("sectionLabel", sectionLabel, "eventIds", eventIds));
    }
}
