package com.eventbooking.controller.hold;

import com.eventbooking.security.CurrentUserId;
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
@RequestMapping("/api/v1/events/{eventId}/holds")
public class HoldController {

    private final HoldService holdService;

    public HoldController(HoldService holdService) {
        this.holdService = holdService;
    }

    @PostMapping
    public ResponseEntity<HoldResponse> createHold(
            @PathVariable Long eventId,
            @Valid @RequestBody CreateHoldRequest request,
            @CurrentUserId Long userId) {
        HoldResponse response = holdService.createHold(eventId, request.seatIds(), request.zoneQty(), userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{holdId}")
    public ResponseEntity<HoldResponse> getHold(
            @PathVariable Long holdId,
            @CurrentUserId Long userId) {
        return ResponseEntity.ok(holdService.getHold(holdId, userId));
    }

    /**
     * The one-time extension behind the countdown bar's "Extend hold" button.
     *
     * <p>Returns the whole hold rather than 204, because the client's next act
     * is to redraw a countdown: handing back the new {@code expires_at} saves a
     * follow-up GET, and means the clock can never disagree with the server
     * about when the seats go back on sale.
     *
     * <p>409 on a second attempt is deliberate - see HoldAlreadyExtendedException.
     */
    @PostMapping("/{holdId}/extend")
    public ResponseEntity<HoldResponse> extendHold(
            @PathVariable Long holdId,
            @CurrentUserId Long userId) {
        return ResponseEntity.ok(holdService.extendHold(holdId, userId));
    }

    @DeleteMapping("/{holdId}")
    public ResponseEntity<Void> releaseHold(
            @PathVariable Long holdId,
            @CurrentUserId Long userId) {
        holdService.releaseHold(holdId, userId);
        return ResponseEntity.noContent().build();
    }
}
