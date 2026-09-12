package com.eventbooking.controller.Zone;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.security.EventVisibilityGuard;
import com.eventbooking.dto.Zone.ZoneAvailabilityResponse;
import com.eventbooking.service.Zone.ZoneAvailabilityService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;


@RestController
@Slf4j
// TODO: restrict allowed origins/methods before production (currently wide open).
@CrossOrigin
@RequestMapping(value = "/api/v1")
public class ZoneAvailabilityController {
    private final ZoneAvailabilityService zoneAvailabilityService;
    private final EventVisibilityGuard eventVisibilityGuard;

    public ZoneAvailabilityController(ZoneAvailabilityService zoneAvailabilityService,
                                      EventVisibilityGuard eventVisibilityGuard) {
        this.zoneAvailabilityService = zoneAvailabilityService;
        this.eventVisibilityGuard = eventVisibilityGuard;
    }

    @GetMapping("/zone/{zoneId}/availability")
    public ResponseEntity<ZoneAvailabilityResponse> getAvailability(
            @CurrentUserId(optional = true) Long actorUserId,
            @PathVariable Long zoneId) {
        eventVisibilityGuard.requireZoneReadable(zoneId, actorUserId);
        return new ResponseEntity<>(zoneAvailabilityService.getAvailability(zoneId), HttpStatus.OK);
    }

    @GetMapping("/events/{eventId}/availability")
    public ResponseEntity<List<ZoneAvailabilityResponse>> getAvailabilityEvent(
            @CurrentUserId(optional = true) Long actorUserId,
            @PathVariable Long eventId) {
        eventVisibilityGuard.requireReadable(eventId, actorUserId);
        return new ResponseEntity<>(zoneAvailabilityService.getEventAvailability(eventId), HttpStatus.OK);
    }



}
