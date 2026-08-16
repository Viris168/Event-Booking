package com.eventbooking.controller.Zone;

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
@RequestMapping(value = "/v1")
public class ZoneAvailabilityController {
    private final ZoneAvailabilityService zoneAvailabilityService;

    public ZoneAvailabilityController(ZoneAvailabilityService zoneAvailabilityService) {
        this.zoneAvailabilityService = zoneAvailabilityService;
    }

    @GetMapping("/zone/{zoneId}/availability")
    public ResponseEntity<ZoneAvailabilityResponse> getAvailability(@PathVariable Long zoneId) {
        return new ResponseEntity<>(zoneAvailabilityService.getAvailability(zoneId), HttpStatus.OK);
    }

    @GetMapping("/event/{eventId}/availability")
    public ResponseEntity<List<ZoneAvailabilityResponse>> getAvailabilityEvent(@PathVariable Long eventId) {
        return new ResponseEntity<>(zoneAvailabilityService.getEventAvailability(eventId), HttpStatus.OK);
    }



}
