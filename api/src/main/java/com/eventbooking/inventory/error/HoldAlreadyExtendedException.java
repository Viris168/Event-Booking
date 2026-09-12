package com.eventbooking.inventory.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The hold has already used its one extension.
 *
 * <p>Refused rather than treated as a no-op on purpose: a client that retried
 * on a success response would keep the seats indefinitely, which is exactly
 * what the single {@code hold.extended} flag exists to prevent.
 */
public class HoldAlreadyExtendedException extends ApiException {
    public HoldAlreadyExtendedException(Long holdId) {
        super(ErrorCode.HOLD_ALREADY_EXTENDED,
                "Hold " + holdId + " has already been extended once, which is the limit.");
    }
}
