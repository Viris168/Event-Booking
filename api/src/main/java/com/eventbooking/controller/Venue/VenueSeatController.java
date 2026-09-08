package com.eventbooking.controller.Venue;

import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.VenueSeat.VenueSeatMapResponse;
import com.eventbooking.service.Venue.VenueSeatService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The physical seats in a building.
 *
 * <p><b>Venue-level, and deliberately not under an event.</b> A
 * {@code venue_seat} row is a chair that exists whether or not anything is on
 * tonight, and every event held there points at the same rows - so a section
 * added here appears in every future show at that venue, and one deleted would
 * be missing from all of them.
 *
 * <p>{@link VenueSeatService} was written and never exposed, which left the
 * organiser's seat-map editor talking to the browser's prototype store: seats
 * "generated" there were never sent anywhere and disappeared on reload.
 */
@RestController
@RequestMapping("/api/v1/venue/{venueId}/seats")
@Tag(name = "Venue seats", description = "The physical seat map of a building, shared by its events")
public class VenueSeatController {

    private final VenueSeatService venueSeatService;

    public VenueSeatController(VenueSeatService venueSeatService) {
        this.venueSeatService = venueSeatService;
    }

    @PostMapping
    @Operation(
            summary = "Add seats to this venue's map",
            description = """
                    Takes explicit rows rather than a rows×columns shape, because a real room
                    is not always a grid — a balcony wraps, a box has four seats, and the
                    client is the side that knows the layout it drew.

                    Affects **every event at this venue**, including ones already on sale.""")
    public ResponseEntity<VenueSeatMapResponse> create(
            @PathVariable Long venueId,
            @Valid @RequestBody CreateVenueSeatsRequest request) {

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(venueSeatService.createVenueSeats(request));
    }

    @GetMapping
    @Operation(summary = "This venue's seat map")
    public VenueSeatMapResponse get(@PathVariable Long venueId) {
        return venueSeatService.getVenueSeatMap(venueId);
    }
}
