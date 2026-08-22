package com.eventbooking.controller.hold;

import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.service.hold.HoldService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Slf4j
@RequestMapping("/v1/holds")
public class MyHoldController {

    private final HoldService holdService;

    public MyHoldController(HoldService holdService) {
        this.holdService = holdService;
    }

    /**
     * The caller's still-ACTIVE holds across all events, newest first.
     * Used by the checkout flow to resume a hold without knowing the
     * event id up front (the DB guarantees at most one per event).
     */
    @GetMapping("/my-active-hold")
    public ResponseEntity<List<HoldResponse>> getMyActiveHold(
            @RequestHeader("X-User-Id") Long userId) {
        return ResponseEntity.ok(holdService.getMyActiveHolds(userId));
    }
}
