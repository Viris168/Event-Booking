package com.eventbooking.service.ABAPay;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Refuses to start in LIVE mode without PayWay merchant credentials.
 *
 * <p>PayWay was the one credential in the system that failed <em>open</em>.
 * Every other one stops the application: {@code JwtSecretGuard},
 * {@code TicketSecretGuard}, {@code Cloudinaryconfig}, {@code KhqrGenerator} on
 * the Bakong account id, and {@code BakongClientConfig} on the bearer token.
 * {@link PaywayProperties} is a plain holder with no validation, and
 * application.yml defaults both fields to empty — correctly, since a merchant
 * id baked into the repository is what would otherwise talk to ABA on a deploy
 * that forgot to set one.
 *
 * <p>The result was the worst shape a failure can have. A deploy with
 * {@code PAYWAY_MODE=LIVE} and a blank key started cleanly, reported healthy,
 * passed the deploy script's health gate, and then failed on the first customer
 * who chose ABA — signing a request with an empty key. Nothing in the pipeline
 * had any reason to complain, because nothing in the pipeline exercises a real
 * payment.
 *
 * <p><b>Keyed on the mode, not on a profile</b>, unlike the two secret guards.
 * Those defend against a placeholder value that is dangerous in any environment.
 * This one is about missing credentials, which only matter once the application
 * is actually talking to ABA — and {@code PAYWAY_MODE} is precisely the switch
 * that decides whether it is. A MOCK environment  needs no credentials and is
 * left alone.
 */
@Component
public class PaywayCredentialsGuard {

    private static final Logger log = LoggerFactory.getLogger(PaywayCredentialsGuard.class);

    public PaywayCredentialsGuard(PaywayProperties payway) {
        if (!isLive(payway.getMode())) {
            // Same warning the Bakong client emits in MOCK, and for the same
            // reason: a staging box quietly settling payments nobody paid is
            // fine, and being unaware of which mode you are in is not.
            log.warn("ABA PayWay is in {} mode - transactions are simulated and no money moves. "
                            + "Set PAYWAY_MODE=LIVE with merchant credentials for the real gateway.",
                    payway.getMode());
            return;
        }

        if (isBlank(payway.getMerchantId()) || isBlank(payway.getApiKey())) {
            throw new IllegalStateException("""
                    PAYWAY_MODE is LIVE but the merchant credentials are not set.

                    Both are required:
                      PAYWAY_MERCHANT_ID  (payway.merchant-id)
                      PAYWAY_API_KEY      (payway.api-key)

                    Neither has a default, deliberately - an id baked into the repository \
                    would be what talks to ABA on any deploy that forgot to set one.

                    Failing here beats failing later: with a blank key the application \
                    starts, reports healthy, and signs its first real transaction with \
                    nothing, so the first person to discover it is a customer at checkout.

                    For local or staging work set PAYWAY_MODE=MOCK, which needs no \
                    credentials.\
                    """);
        }

        log.info("ABA PayWay is LIVE against {}", payway.getBaseUrl());
    }

    /** Trimmed and case-insensitive: {@code PAYWAY_MODE=live}  asfka;d;must not silently  jasdjsaf alan MOCK. */
    private static boolean isLive(String mode) {
        return mode != null && "LIVE".equalsIgnoreCase(mode.trim());
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
