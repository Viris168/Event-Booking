package com.eventbooking.payment;

import com.eventbooking.Enumeration.PaymentProvider;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The per-provider poll floor.
 *
 * <p>Worth pinning because the cost of getting it wrong is invisible until
 * production: a Bakong account capped at 100 requests a <b>day</b> is drained
 * in nine minutes by one pending QR checked on the 5-second sweep, and nothing
 * fails loudly when it happens - payments simply stop settling.
 */
class PaymentPollFloorTest {

    private static PaymentProperties.Poll poll(Map<PaymentProvider, Duration> floors) {
        return new PaymentProperties.Poll(
                true, Duration.ofSeconds(5), 50, Duration.ofSeconds(3), floors,
                Duration.ofMinutes(1));
    }

    @Test
    void bakongGetsItsOwnSlowerFloor() {
        PaymentProperties.Poll p = poll(Map.of(
                PaymentProvider.BAKONG_KHQR, Duration.ofSeconds(60),
                PaymentProvider.ABA_PAYWAY, Duration.ofSeconds(3)));

        assertThat(p.floorFor(PaymentProvider.BAKONG_KHQR)).isEqualTo(Duration.ofSeconds(60));
        assertThat(p.floorFor(PaymentProvider.ABA_PAYWAY))
                .as("PayWay has no daily cap and a fast check is what makes it feel instant")
                .isEqualTo(Duration.ofSeconds(3));
    }

    @Test
    void aProviderWithNoOverrideFallsBackRatherThanGettingNoFloor() {
        // The failure mode this guards: adding a provider and silently giving it
        // an unlimited poll rate.
        PaymentProperties.Poll p = poll(Map.of(PaymentProvider.ABA_PAYWAY, Duration.ofSeconds(3)));

        assertThat(p.floorFor(PaymentProvider.BAKONG_KHQR)).isEqualTo(Duration.ofSeconds(3));
    }

    @Test
    void anAbsentMapIsNotAnAbsentFloor() {
        PaymentProperties.Poll p = poll(null);

        assertThat(p.floorFor(PaymentProvider.BAKONG_KHQR)).isEqualTo(Duration.ofSeconds(3));
        assertThat(p.floorFor(null)).isEqualTo(Duration.ofSeconds(3));
    }
}
