package com.eventbooking.Job;

import com.eventbooking.service.hold.HoldService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;

@Component
public class HoldExpiryJob {

    private final HoldService holdService;
    private final Clock clock;

    public HoldExpiryJob(HoldService holdService, Clock clock) {
        this.holdService = holdService;
        this.clock = clock;
    }

    @Scheduled(fixedDelay = 30_000)
    public void expireHolds() {
        int expired = holdService.expireActiveHolds(clock.instant());
        // log expired here — the metric that tells you the job is still running
    }
}
