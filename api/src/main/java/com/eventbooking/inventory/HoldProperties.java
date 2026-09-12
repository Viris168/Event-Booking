package com.eventbooking.inventory;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Hold timing knobs, bound from the `app.hold.*` block in application.yml.
 *
 * <p>These values were already in application.yml - and HOLD_EXTENSION_MINUTES
 * in .env.example - but nothing read them: the TTL was a hardcoded constant in
 * HoldServiceimpl and the extension minutes had no consumer at all, because
 * there was no extend endpoint. Binding them here is what makes the deployment
 * knob real.
 *
 * @param ttlMinutes        how long a fresh hold lasts.
 * @param extensionMinutes  how much time the one-time extension adds. Applied
 *                          from the hold's existing deadline, not from now, so
 *                          extending early is never a penalty.
 * @param sweeperIntervalMs how often HoldExpiryJob looks for lapsed holds.
 *                          Bound for completeness - @Scheduled needs a
 *                          constant, so the job reads it via SpEL rather than
 *                          from this record.
 */
@ConfigurationProperties(prefix = "app.hold")
public record HoldProperties(
        int ttlMinutes,
        int extensionMinutes,
        long sweeperIntervalMs
) {
}
