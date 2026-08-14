package com.eventbooking.payment;

import com.eventbooking.Enumeration.PaymentCurrency;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The payment lane's knobs, bound from the {@code app.payment.*} block in
 * application.yml and picked up by {@code @ConfigurationPropertiesScan} on the
 * main class. Every value has an env-var override, so nothing here needs a
 * code change to differ between a laptop and production.
 *
 * @param bakong Bakong KHQR: who the money goes to, and how to reach the API
 * @param poll   how hard the reconciler works
 */
@ConfigurationProperties(prefix = "app.payment")
public record PaymentProperties(
        Bakong bakong,
        Poll poll
) {

    /** Which tag the KHQR merchant template uses, and what it must carry. */
    public enum BakongAccountType {
        /** Tag 29: a personal Bakong account. Account id alone. */
        INDIVIDUAL,
        /** Tag 30: a registered merchant. Also needs a merchant id and acquiring bank. */
        MERCHANT
    }

    /**
     * How the Bakong client is fulfilled.
     *
     * <p>MOCK is the default on purpose: the platform has no Bakong merchant
     * credentials yet, and every other lane - checkout, the reconciler, the web
     * pay screen - has to be runnable end to end before those arrive. Switching
     * to LIVE changes nothing but which bean answers {@code checkByMd5}.
     */
    public enum BakongMode {
        MOCK,
        LIVE
    }

    /**
     * @param mode                MOCK for local work, LIVE against the real API
     * @param baseUrl             Bakong Open API root; the sandbox is a different host
     * @param bearerToken         issued by NBC against a registered email, expires and must be renewed
     * @param accountId           the Bakong account the money lands in, e.g. "event_booking@wing"
     * @param accountType         decides between the individual and merchant QR templates
     * @param merchantId          MERCHANT accounts only
     * @param acquiringBank       MERCHANT accounts only
     * @param merchantName        printed in the bank app's confirmation, max 25 chars
     * @param merchantCity        printed in the bank app's confirmation, max 15 chars
     * @param merchantCategoryCode ISO 18245; 5999 is "miscellaneous retail", the usual
     *                            catch-all for ticketing
     * @param storeLabel          free text shown alongside the amount
     * @param terminalLabel       free text; useful for telling channels apart later
     * @param currency            which of the booking's two totals to charge. KHR by
     *                            default: it is what Cambodian bank apps expect and it
     *                            avoids a rounding argument, since the USD total is
     *                            already exact and the KHR one was snapshotted at
     *                            checkout from the same rate
     * @param qrTtl               how long a QR stays scannable. Shorter than the
     *                            booking's payment window on purpose, so an abandoned
     *                            QR is reclaimed while the customer still has time to
     *                            start a fresh one against the same inventory
     * @param connectTimeout      kept short - the reconciler runs on a schedule and a
     *                            hung socket would stall the whole sweep
     * @param readTimeout         same reasoning
     */
    public record Bakong(
            BakongMode mode,
            String baseUrl,
            String bearerToken,
            String accountId,
            BakongAccountType accountType,
            String merchantId,
            String acquiringBank,
            String merchantName,
            String merchantCity,
            String merchantCategoryCode,
            String storeLabel,
            String terminalLabel,
            PaymentCurrency currency,
            Duration qrTtl,
            Duration connectTimeout,
            Duration readTimeout
    ) {
    }

    /**
     * @param enabled            turn the scheduled sweep off entirely (tests, or a
     *                           second instance that should not double-poll)
     * @param interval           gap between sweeps. Bakong rate-limits per token, so
     *                           this is the main dial if the API starts complaining
     * @param batchSize          most attempts settled per sweep. Caps both the provider
     *                           calls and the time one sweep can hold the executor
     * @param minRefreshInterval floor between provider checks for a single attempt.
     *                           Stops a browser tab (or twenty) driving the refresh
     *                           endpoint into Bakong's rate limit - a refresh inside
     *                           this window returns what the database already knows
     * @param bookingSweep       gap between booking-expiry sweeps, which is the
     *                           timeout that actually returns seats to the pool
     */
    public record Poll(
            boolean enabled,
            Duration interval,
            int batchSize,
            Duration minRefreshInterval,
            Duration bookingSweep
    ) {
    }
}
