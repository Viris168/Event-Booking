package com.eventbooking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration for automatically closing abandoned PayWay transactions. */
@ConfigurationProperties(prefix = "payway.close-stale")
public class PaywayCloseStaleProperties {

    private long fixedDelayMs = 60_000;
    private long afterMinutes = 5;

    public long getFixedDelayMs() {
        return fixedDelayMs;
    }

    public void setFixedDelayMs(long fixedDelayMs) {
        this.fixedDelayMs = fixedDelayMs;
    }

    public long getAfterMinutes() {
        return afterMinutes;
    }

    public void setAfterMinutes(long afterMinutes) {
        this.afterMinutes = afterMinutes;
    }
}
