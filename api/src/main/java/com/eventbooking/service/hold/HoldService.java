package com.eventbooking.service.hold;

import com.eventbooking.dto.hold.HoldResponse;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface HoldService {

    HoldResponse createHold(Long eventId, List<Long> seatIds, Map<Long, Integer> zoneQty, Long userId);

    HoldResponse getHold(Long holdId, Long userId);

    /**
     * Pushes an active hold's deadline out by the configured extension window,
     * once and only once per hold.
     *
     * @throws com.eventbooking.inventory.error.HoldNotFoundException        no such hold, or not the caller's
     * @throws com.eventbooking.inventory.error.HoldAlreadyExtendedException the one extension is already spent
     * @throws com.eventbooking.inventory.error.HoldNotActiveException       consumed or released
     * @throws com.eventbooking.inventory.error.HoldExpiredException         too late; the inventory is released first
     */
    HoldResponse extendHold(Long holdId, Long userId);

    List<HoldResponse> getMyActiveHolds(Long userId);

    void releaseHold(Long holdId, Long userId);

    int expireActiveHolds(Instant currentTime);
}
