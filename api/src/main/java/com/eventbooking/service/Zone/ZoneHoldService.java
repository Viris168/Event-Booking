package com.eventbooking.service.Zone;

import com.eventbooking.dto.hold.HoldResponse;

import java.time.Instant;

public interface ZoneHoldService {

    HoldResponse createHold(
        Long eventId,
        Long zoneId,
        String holderToken,
        int quantity
    );

    HoldResponse getHold(
        Long holdId,
        String holderToken
    );

    void releaseHold(
        Long holdId,
        String holderToken
    );

    int expireActiveHolds(Instant currentTime);

    void convertHold(Long holdId);
}