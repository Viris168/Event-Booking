package com.eventbooking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Reading a bank transfer confirmation off a screenshot, so the admin does not
 * have to retype the reference.
 *
 * <p>Bound from {@code app.receipt-extraction.*} and picked up by
 * {@code @ConfigurationPropertiesScan}, like every other properties record
 * here.
 *
 * <p><b>Absent is a supported state.</b> With no key the feature turns itself
 * off and the transfer dialog falls back to what it has always been - a text
 * field the admin types into. That is the same choice Telegram's missing token
 * makes and the opposite of {@link PayoutProperties}: a misconfigured fee gets
 * charged to somebody, whereas a missing vision key costs a convenience. It is
 * not worth failing startup over, least of all on a deployment that never meant
 * to switch this on.
 *
 * @param apiKey    the vision provider credential. Blank disables the endpoint.
 * @param model     the model id, in the URL. Kept as configuration because it
 *                  is the one thing here that changes on somebody else's
 *                  schedule - a model is retired and a deployment needs to move
 *                  without a rebuild.
 * @param baseUrl   the generative endpoint, less the model and the key.
 * @param timeout   how long to wait before giving up and letting the admin
 *                  type. Short on purpose: this sits in front of somebody who
 *                  is mid-task with a banking app open in another window, and a
 *                  spinner that outlasts their patience is worse than a field.
 * @param maxBytes  the largest image accepted. The browser already downscales
 *                  before it uploads, so anything near this is a client that
 *                  did not - and the whole image travels to the provider
 *                  base64-encoded, a third larger again.
 */
@ConfigurationProperties(prefix = "app.receipt-extraction")
public record ReceiptExtractionProperties(
        String apiKey,
        String model,
        String baseUrl,
        Duration timeout,
        long maxBytes) {

    public ReceiptExtractionProperties {
        if (model == null || model.isBlank()) {
            model = "gemini-3.6-flash";
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";
        }
        if (timeout == null) {
            timeout = Duration.ofSeconds(20);
        }
        if (maxBytes <= 0) {
            maxBytes = 4 * 1024 * 1024;
        }
    }

    /** False on any deployment that never set a key - see the record doc. */
    public boolean enabled() {
        return apiKey != null && !apiKey.isBlank();
    }
}
