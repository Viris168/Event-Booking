package com.eventbooking.controller.Seat;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.security.EventVisibilityGuard;
import com.eventbooking.dto.seatclass.SeatAvailabilityResponse;
import com.eventbooking.service.Seat.SeatAvailabilityService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/events/{eventId}/seats/availability")
public class SeatAvailabilityController {

    private final SeatAvailabilityService seatAvailabilityService;
    private final EventVisibilityGuard eventVisibilityGuard;

    public SeatAvailabilityController(SeatAvailabilityService seatAvailabilityService,
                                      EventVisibilityGuard eventVisibilityGuard) {
        this.seatAvailabilityService = seatAvailabilityService;
        this.eventVisibilityGuard = eventVisibilityGuard;
    }

    @GetMapping
    public ResponseEntity<List<SeatAvailabilityResponse>> getSeatMapAvailability(
            @CurrentUserId(optional = true) Long actorUserId,
            @PathVariable Long eventId
    ) {
        eventVisibilityGuard.requireReadable(eventId, actorUserId);
        return ResponseEntity.ok(seatAvailabilityService.getSeatMapAvailability(eventId));
    }
}