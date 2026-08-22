package com.eventbooking.controller.Event;

import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.dto.eventseat.SeatMapResponse;
import com.eventbooking.service.event.EventSeatService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@Slf4j
public class EventSeatController {

    private final EventSeatService eventSeatService;

    public EventSeatController(EventSeatService eventSeatService) {
        this.eventSeatService = eventSeatService;
    }

    @PostMapping("/v1/events/{eventId}/seats")
    public ResponseEntity<SeatMapResponse> generateEventSeats(
            @PathVariable Long eventId,
            @Valid @RequestBody GenerateEventSeatsRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(eventSeatService.generateEventSeats(eventId, request));
    }


    @GetMapping("/v1/event/{eventId}/seat-map")
    public ResponseEntity<SeatMapResponse> getSeatMap(
            @PathVariable Long eventId
    ) {
        return ResponseEntity.ok(eventSeatService.getSeatMap(eventId));
    }


}
