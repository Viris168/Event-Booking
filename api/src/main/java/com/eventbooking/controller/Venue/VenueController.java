package com.eventbooking.controller.venue;

import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
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
@RequestMapping(value = "/v1/venue")
public class VenueController {
    private final VenueService venueService;

    public VenueController(VenueService venueService) {
        this.venueService = venueService;
    }

    @PostMapping
    public ResponseEntity<VenueResponse> createVenue(@Valid @RequestBody CreateVenueRequest venue) {
        VenueResponse v = venueService.createVenue(venue);
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
    public ResponseEntity<VenueResponse> updateVenue(@PathVariable Long id, @Valid @RequestBody UpdateVenueRequest request) {
        VenueResponse v = venueService.updateVenue(id, request);
        return new ResponseEntity<>(v, HttpStatus.OK);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteVenue(@PathVariable Long id) {
        venueService.deactivateVenue(id);
        return ResponseEntity.noContent().build();
    }

}
