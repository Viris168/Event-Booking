package com.eventbooking.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The Telegram bot the platform shouts at when something needs a human.
 *
 * <p>Bound from the {@code app.telegram.*} block and picked up by
 * {@code @ConfigurationPropertiesScan} on the main class, like every other
 * properties record here. Both credentials have env-var overrides so the token
 * lives in {@code api/.env} - which is gitignored - and never in a committed
 * file.
 *
 * <p>Absent by default, and that is deliberate. Unlike the Bakong client, which
 * fails startup when LIVE mode has no token, Telegram is an extra: it carries a
 * copy of a notification the platform has already written to its own inbox. A
 * missing token must leave the product working exactly as it did before, so the
 * notifier disables itself and says so once at boot rather than throwing.
 *
 * @param botToken      from @BotFather, "12345:AA...". A credential - anyone
 *                      holding it can post as the bot, so it belongs in
 *                      .env, never in yml.
 * @param chatId        where the admin-facing notifications post. A personal
 *                      chat is a positive number; a group or channel is
 *                      negative, usually -100-prefixed.
 * @param timeout       how long to wait on api.telegram.org before giving up.
 * @param botUsername   the bot's @handle, without the @ - the part of a
 *                      {@code t.me/<username>?start=<token>} connect link
 *                      that {@code botToken} cannot supply on its own.
 * @param webhookSecret compared against the {@code X-Telegram-Bot-Api-Secret-Token}
 *                      header Telegram echoes back on every webhook call.
 *                      That header is what stands in for auth on that one
 *                      endpoint - Telegram's servers cannot carry a JWT of
 *                      ours - so this is a credential exactly like
 *                      {@code botToken} and belongs in .env the same way.
 */
@ConfigurationProperties(prefix = "app.telegram")
public record TelegramProperties(
        String botToken,
        String chatId,
        Duration timeout,
        String botUsername,
        String webhookSecret
) {

    public TelegramProperties {
        // A short ceiling on purpose. This runs on the listener thread after an
        // application commits; a hung socket there would hold that thread while
        // the applicant sits looking at a spinner for something that has, in
        // fact, already been saved.
        if (timeout == null) timeout = Duration.ofSeconds(5);
    }

    /** Whether there is enough here to send anything at all. */
    public boolean configured() {
        return botToken != null && !botToken.isBlank()
                && chatId != null && !chatId.isBlank();
    }

    /**
     * Whether an incoming call can be trusted as Telegram's. Deliberately
     * separate from {@link #configured()}: sending to the admin channel and
     * accepting webhook calls are independent capabilities, and a deployment
     * that wants one without the other should be able to have it.
     */
    public boolean webhookConfigured() {
        return botToken != null && !botToken.isBlank()
                && webhookSecret != null && !webhookSecret.isBlank();
    }
}
