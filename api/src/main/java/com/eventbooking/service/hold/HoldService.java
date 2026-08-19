package com.eventbooking.service.hold;

import com.eventbooking.dto.hold.HoldResponse;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface HoldService {

    HoldResponse createHold(Long eventId, List<Long> seatIds, Map<Long, Integer> zoneQty, Long userId);

    HoldResponse getHold(Long holdId, Long userId);

    void releaseHold(Long holdId, Long userId);

    int expireActiveHolds(Instant currentTime);
}
