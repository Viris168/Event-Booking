package com.eventbooking.dto.booking;

import com.eventbooking.Enumeration.BookingStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record BookingResponse(
        Long id,
        String bookingRef,
        Long eventId,
        Long userId,
        Long holdId,
        BookingStatus state,
        String buyerName,
        String buyerPhoneE164,
        String buyerEmail,
        Long subtotalUsdCents,
        Long totalUsdCents,
        BigDecimal fxRateKhrPerUsd,
        Long totalKhr,
        Instant createdAt,
        Instant stateChangedAt,
        List<BookingItemResponse> items
) {
}
