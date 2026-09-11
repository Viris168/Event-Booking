package com.eventbooking.controller.Venue;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.security.OrganizerResolver;
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

    public VenueController(VenueService venueService, OrganizerResolver organizerResolver) {
        this.venueService = venueService;
        this.organizerResolver = organizerResolver;
    }

    @PostMapping
    public ResponseEntity<VenueResponse> createVenue(
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody CreateVenueRequest venue) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        VenueResponse v = venueService.createVenue(organizerId, venue);
        return new ResponseEntity<>(v, HttpStatus.CREATED);
    }

    @GetMapping
    public ResponseEntity<List<VenueResponse>> getAllVenues() {
        return new ResponseEntity<>(venueService.getAllVenues(), HttpStatus.OK);
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
