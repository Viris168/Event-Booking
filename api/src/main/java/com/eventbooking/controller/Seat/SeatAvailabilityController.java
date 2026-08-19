package com.eventbooking.controller.Seat;

import com.eventbooking.dto.seatclass.SeatAvailabilityResponse;
import com.eventbooking.service.Seat.SeatAvailabilityService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/events/{eventId}/seats/availability")
public class SeatAvailabilityController {

    private final SeatAvailabilityService seatAvailabilityService;

    public SeatAvailabilityController(SeatAvailabilityService seatAvailabilityService) {
        this.seatAvailabilityService = seatAvailabilityService;
    }

    @GetMapping
    public ResponseEntity<List<SeatAvailabilityResponse>> getSeatMapAvailability(
            @PathVariable Long eventId
    ) {
        return ResponseEntity.ok(seatAvailabilityService.getSeatMapAvailability(eventId));
    }
}