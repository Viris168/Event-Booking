package com.eventbooking.dto.seatclass;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * <p><b>The event is not in here.</b> It comes from the path. It used to be in
 * both, where the body copy was silently ignored - a field a client could set
 * and watch have no effect is worse than no field, and while ownership is
 * checked against one id and the write uses another the check is decorative.
 */
public record CreateSeatClassRequest(
        @NotBlank String nameEn,
        @NotBlank String nameKm,
        @Positive Integer priceUsdCents
) {
}
