package com.eventbooking.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on {@code @Scheduled}, which nothing in the app did before the payment
 * reconciler needed it.
 *
 * <p>The switch is a property rather than a hard-coded annotation so a test - or
 * a second instance that must not double-poll - can start the context without
 * background work firing underneath it. Nothing here coordinates across
 * processes: run one poller, or give the sweeps a shared lock first.
 *
 * <p>Boot's default scheduler is a single thread. That is deliberate for now:
 * the payment sweep and the booking sweep both write bookings, and letting them
 * interleave would buy contention for no throughput.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "app.scheduling", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfig {
}
