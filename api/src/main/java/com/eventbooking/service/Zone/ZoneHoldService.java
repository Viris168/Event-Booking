package com.eventbooking.service.Zone;

import com.eventbooking.dto.hold.HoldResponse;

import java.time.Instant;

public interface ZoneHoldService {

    HoldResponse createHold(
        Long eventId,
        Long zoneId,
        Long userId,
        int quantity
    );

    HoldResponse getHold(
        Long holdId,
        Long userId
    );

    void releaseHold(
        Long holdId,
        Long userId
    );

    int expireActiveHolds(Instant currentTime);
}
