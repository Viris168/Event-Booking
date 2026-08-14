package com.eventbooking.booking;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

/**
 * Checkout knobs, bound from the `app.booking.*` block in application.yml.
 *
 * @param fxKhrPerUsd         USD -> KHR rate used to fill booking.total_khr.
 *                            A static config value for now; when a rate feed
 *                            exists this becomes its fallback. The rate is
 *                            snapshotted onto every booking, so changing it
 *                            never disturbs bookings already taken.
 * @param paymentWindowMinutes how long a booking may sit unpaid before the
 *                            sweeper expires it and returns the inventory.
 */
@ConfigurationProperties(prefix = "app.booking")
public record BookingProperties(
        BigDecimal fxKhrPerUsd,
        int paymentWindowMinutes
) {
}
