package com.eventbooking.controller.Event;

import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.service.event.EventService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@Slf4j
@CrossOrigin
@RequestMapping(value = "/v1/event")
public class EventController {

    private final EventService eventService;


    public EventController(EventService eventService) {
        this.eventService = eventService;
    }

    @PostMapping
    public ResponseEntity<EventResponse> createEvent(@Valid @RequestBody CreateEventRequest eventRequest) {
        EventResponse eventResponse = eventService.createEvent(eventRequest);
        return new ResponseEntity<>(eventResponse,HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    public ResponseEntity<EventResponse> getEvent(@PathVariable Long id) {
        EventResponse eventResponse = eventService.getEvent(id);
        return new ResponseEntity<>(eventResponse,HttpStatus.OK);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<EventResponse> updateEvent(@PathVariable Long id, @Valid  @RequestBody UpdateEventRequest request) {
        EventResponse eventResponse = eventService.updateEvent(id, request);
        return new ResponseEntity<>(eventResponse,HttpStatus.OK);
    }

    @PatchMapping("/{id}/publish")
    public ResponseEntity<EventResponse> publishEvent(@PathVariable Long id) {
        EventResponse updatedEvent = eventService.publishEvent(id);
        return new ResponseEntity<>(updatedEvent, HttpStatus.OK);
    }

    @GetMapping("/{id}/verify")
    public ResponseEntity<Void> verifyEvent(@PathVariable Long id) {
        eventService.verifyEventIsOnSale(id);
        return ResponseEntity.ok().build();
    }


}
