package com.eventbooking.controller.Venue;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.ResolveMapLinkRequest;
import com.eventbooking.dto.venue.ResolvedMapLinkResponse;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Venue.MapLinkResolver;
import com.eventbooking.service.Venue.VenueService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@Slf4j
// TODO: restrict allowed origins/methods before production (currently wide open).
@CrossOrigin
@RequestMapping(value = "/api/v1/venue")
public class VenueController {
    private final VenueService venueService;
    private final OrganizerResolver organizerResolver;
    private final MapLinkResolver mapLinkResolver;

    public VenueController(VenueService venueService,
                           OrganizerResolver organizerResolver,
                           MapLinkResolver mapLinkResolver) {
        this.venueService = venueService;
        this.organizerResolver = organizerResolver;
        this.mapLinkResolver = mapLinkResolver;
    }

    /**
     * Follows a Google Maps share link and returns where it led.
     *
     * <p>Exists because {@code maps.app.goo.gl} links hold no coordinates, and
     * the redirect that reveals them cannot be read from a browser. A full Maps
     * URL never needs this call - the frontend parses those itself.
     *
     * <p>Organiser-only, though it touches no venue row. It makes an outbound
     * request on the caller's say-so, and that is not something to leave open to
     * anonymous callers however narrow the allowlist is.
     */
    @PostMapping("/resolve-map-link")
    public ResponseEntity<ResolvedMapLinkResponse> resolveMapLink(
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody ResolveMapLinkRequest request) {
        organizerResolver.requireOrganizerId(actorUserId);
        String resolved = mapLinkResolver.resolve(request.url());
        return new ResponseEntity<>(new ResolvedMapLinkResponse(resolved), HttpStatus.OK);
    }

    @PostMapping
    public ResponseEntity<VenueResponse> createVenue(
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody CreateVenueRequest venue) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        VenueResponse v = venueService.createVenue(organizerId, venue);
        return new ResponseEntity<>(v, HttpStatus.CREATED);
    }

    /**
     * The caller's own venues.
     *
     * <p>Was unauthenticated and returned every venue on the platform. That is
     * what made a venue shared in practice - the event form's picker listed
     * other organisers' buildings, and binding an event to one of them was
     * allowed. Venues belong to the organiser who created them, so this needs
     * to know who is asking.
     *
     * <p>{@code GET /venue/{id}} below stays open on purpose: a booking
     * confirmation and an event page both have to print the venue of an event
     * the reader does not own.
     */
    @GetMapping
    public ResponseEntity<List<VenueResponse>> getMyVenues(@CurrentUserId Long actorUserId) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(venueService.getVenuesForOrganizer(organizerId), HttpStatus.OK);
    }

    @GetMapping("/{id}")
    public ResponseEntity<VenueResponse> getVenue(@PathVariable Long id) {
        VenueResponse v = venueService.getVenue(id);
        return new ResponseEntity<>(v, HttpStatus.OK);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<VenueResponse> updateVenue(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateVenueRequest request) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        VenueResponse v = venueService.updateVenue(organizerId, id, request);
        return new ResponseEntity<>(v, HttpStatus.OK);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteVenue(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        venueService.deactivateVenue(organizerId, id);
        return ResponseEntity.noContent().build();
    }

}
