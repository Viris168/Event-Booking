package com.eventbooking.controller.Zone;

import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.service.Zone.ZoneHoldService;
import jakarta.validation.constraints.Min;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;


@RestController
@Slf4j
// TODO: restrict allowed origins/methods before production (currently wide open).
@CrossOrigin
@Validated
@RequestMapping(value = "/v1")
public class ZoneHoldController {
    private final ZoneHoldService zoneHoldService;

    public ZoneHoldController(ZoneHoldService zoneHoldService) {
        this.zoneHoldService = zoneHoldService;
    }

    @PostMapping("/event/{eventId}/zone/{zoneId}/hold/user/{userId}")
    public ResponseEntity<HoldResponse> createHold(
            @PathVariable("eventId") Long eventId,
            @PathVariable("zoneId") Long zoneId,
            @PathVariable("userId") Long userId,
            @RequestParam @Min(1) int quantity) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(zoneHoldService.createHold(eventId, zoneId, userId, quantity));
    }

    @GetMapping("/hold/{holdId}/user/{userId}")
    public ResponseEntity<HoldResponse>  getHold(
            @PathVariable("holdId") Long holdId,
            @PathVariable("userId") Long userId){
        return ResponseEntity.status(HttpStatus.OK).body(zoneHoldService.getHold(holdId, userId));
    }

    @DeleteMapping("/hold/{holdId}/user/{userId}")
    public ResponseEntity<Void> releaseHold(
            @PathVariable("holdId") Long holdId,
            @PathVariable("userId") Long userId){
        zoneHoldService.releaseHold(holdId, userId);
        return ResponseEntity.ok().build();
    }

    // Runs automatically every 60 seconds (60000 ms)
    @Scheduled(fixedRate = 60000)
    public void runSweeper() {
        log.info("Running background sweeper to find expired holds...");

        int expiredCount = zoneHoldService.expireActiveHolds(Instant.now());

        if (expiredCount > 0) {
            log.info("Sweeper finished: Released {} abandoned carts back to the public pool.", expiredCount);
        }
    }


}
