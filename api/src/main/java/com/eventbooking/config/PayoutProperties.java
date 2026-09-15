package com.eventbooking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * What the platform keeps out of an organiser's settlement.
 *
 * <p>Bound from {@code app.payout.*} and picked up by
 * {@code @ConfigurationPropertiesScan} on the main class, like every other
 * properties record here.
 *
 * <p>This is read exactly once per payout - at the moment the request is
 * created, where it is copied into {@code payout_request.fee_bps} and never
 * looked at again. That indirection is the whole point: the rate is
 * configuration and configuration changes, so an invoice that read it live
 * would silently re-price itself the first time somebody edited the yml, years
 * after the money was transferred.
 *
 * @param feeBps commission in basis points - 1000 is 10%. Basis points rather
 *               than a double so the rate is exact: 2.5% has no binary
 *               representation, and a fee computed from one is off by a cent on
 *               amounts large enough for anybody to notice. Charged on settled
 *               receipts - see {@code PayoutServiceimpl}.
 */
@ConfigurationProperties(prefix = "app.payout")
public record PayoutProperties(int feeBps) {

    public PayoutProperties {
        // A misconfigured rate is worth failing startup over, unlike Telegram's
        // missing token. Telegram absent costs a copy of a notification; a fee
        // of -1 or of 40000 would be written into an invoice and charged to
        // somebody, and the DB CHECK that would eventually catch it surfaces as
        // a 500 on the organiser's click rather than as a boot error an
        // operator can fix.
        if (feeBps < 0 || feeBps > 10000) {
            throw new IllegalArgumentException(
                    "app.payout.fee-bps must be between 0 and 10000 basis points, got " + feeBps);
        }
    }
}
