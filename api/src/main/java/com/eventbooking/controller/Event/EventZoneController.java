package com.eventbooking.controller.Event;


import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.eventzone.UpdateZoneRequest;
import com.eventbooking.service.event.EventZoneService;
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
@RequestMapping(value = "/v1")
public class EventZoneController {

    private final EventZoneService eventZoneService;

    public EventZoneController(EventZoneService eventZoneService) {
        this.eventZoneService = eventZoneService;
    }

    @PostMapping("/event/{eventId}/zone")
    public ResponseEntity<EventZoneResponse> createEventZone(
            @PathVariable Long eventId,
            @Valid @RequestBody CreateEventZoneRequest createEventZoneRequest) {
        return new ResponseEntity<>(eventZoneService.createZone(eventId, createEventZoneRequest), HttpStatus.CREATED);

    }

    @GetMapping("/zone/{id}")
    public ResponseEntity<EventZoneResponse> getEventZone(@PathVariable Long id) {
        return new ResponseEntity<>(eventZoneService.getZone(id), HttpStatus.OK);
    }

    @GetMapping("/event/{eventId}/zone")
    public ResponseEntity<List<EventZoneResponse>> getAllEventZones(@PathVariable Long eventId){
        return new ResponseEntity<>(eventZoneService.findByEvent(eventId), HttpStatus.OK);
    }

    @PatchMapping("/zone/{id}")
    public ResponseEntity<EventZoneResponse> updateEventZone(@PathVariable Long id
            , @Valid @RequestBody UpdateZoneRequest updateZoneRequest) {
        return new ResponseEntity<>(eventZoneService.updateZone(id, updateZoneRequest), HttpStatus.OK);
    }

    @DeleteMapping("/zone/{id}")
    public ResponseEntity<Void> deleteEventZone(@PathVariable Long id) {
        eventZoneService.deactivateZone(id);
        return ResponseEntity.noContent().build();
    }



}
