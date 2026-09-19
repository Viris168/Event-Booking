package com.eventbooking.dto.event;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Why an event with paid bookings had to be erased.
 *
 * <p>The only input to the one action on this platform that destroys tickets
 * somebody bought. Nothing reads the field - it is written to the log beside
 * the sales export and never looked at again by any code path - and it is
 * required anyway.
 *
 * <p>The reason is the whole justification for the endpoint existing. Force
 * delete was built for listings that are illegal and have to leave the platform
 * entirely, and the difference between that and an admin misusing the most
 * destructive button in the product is a sentence saying which one this was. A
 * minimum length, because "spam" is not that sentence.
 */
public record ForceDeleteEventRequest(
        @NotBlank @Size(min = 20, max = 2000) String reason
) {
}
