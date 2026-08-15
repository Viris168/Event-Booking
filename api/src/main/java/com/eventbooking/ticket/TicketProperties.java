package com.eventbooking.ticket;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Ticketing knobs, bound from {@code app.ticket.*}.
 *
 * @param signingSecret  HMAC key for QR payloads. <b>Rotating it invalidates
 *                       every ticket already in a customer's hand</b>, so treat
 *                       it as long-lived: separate from the JWT secret, which
 *                       can be rotated freely because access tokens live 15
 *                       minutes and tickets live until the event
 * @param qrSizePx       the {@code width}/{@code height} on the rendered SVG.
 *                       The image is vector, so this is only the default
 *                       presentation size - it scales losslessly past it
 * @param qrMarginModules the quiet zone, in modules. The QR spec says 4, and
 *                       scanners genuinely fail without it; do not trim this to
 *                       make the image look tidier
 */
@ConfigurationProperties(prefix = "app.ticket")
public record TicketProperties(
        String signingSecret,
        int qrSizePx,
        int qrMarginModules
) {

    /** Below this a secret is short enough to be worth attacking directly. */
    public static final int MIN_SECRET_LENGTH = 32;

    /**
     * The value shipped in application.yml. Checked by name so startup can warn
     * that the signing key is public knowledge, rather than silently issuing
     * forgeable tickets.
     */
    public static final String PLACEHOLDER_SECRET =
            "change-this-ticket-secret-before-any-real-event";
}
