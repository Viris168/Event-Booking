package com.eventbooking.controller.hold;

import com.eventbooking.dto.hold.CreateHoldRequest;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.service.hold.HoldService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@Slf4j
@RequestMapping("/v1/events/{eventId}/holds")
public class HoldController {

    private final HoldService holdService;

    public HoldController(HoldService holdService) {
        this.holdService = holdService;
    }

    @PostMapping
    public ResponseEntity<HoldResponse> createHold(
            @PathVariable Long eventId,
            @Valid @RequestBody CreateHoldRequest request,
            @RequestHeader("X-User-Id") Long userId) {
        HoldResponse response = holdService.createHold(eventId, request.seatIds(), request.zoneQty(), userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{holdId}")
    public ResponseEntity<HoldResponse> getHold(
            @PathVariable Long holdId,
            @RequestHeader("X-User-Id") Long userId) {
        return ResponseEntity.ok(holdService.getHold(holdId, userId));
    }

    @DeleteMapping("/{holdId}")
    public ResponseEntity<Void> releaseHold(
            @PathVariable Long holdId,
            @RequestHeader("X-User-Id") Long userId) {
        holdService.releaseHold(holdId, userId);
        return ResponseEntity.noContent().build();
    }
}
