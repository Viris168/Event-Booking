package com.eventbooking.service.notification.telegram;

import com.eventbooking.config.TelegramProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Posts a message to one Telegram chat through the Bot API.
 *
 * <p>One outbound call, deliberately - {@code sendMessage}, called either at a
 * fixed admin chat ({@link #send}) or an arbitrary one ({@link #sendToChat},
 * for an organiser who has connected their own). This is not a Telegram
 * client: there is no polling loop and no webhook handling here, on purpose -
 * an inbound call is {@code TelegramWebhookController}'s job, kept apart so
 * this class stays the one place that can post as the bot.
 *
 * <p><b>Never throws.</b> Every caller is a notification listener running after
 * a transaction has already committed: the organiser application is saved, the
 * admin's in-app notification is written, and this is a copy going out to a
 * phone. If Telegram is down, misconfigured, or the bot was blocked, none of
 * that is a reason to turn a successful application into an error - so failures
 * are logged and swallowed. The in-app inbox remains the record; this is the
 * nudge.
 */
@Component
@Slf4j
public class TelegramNotifier {

    private static final String API = "https://api.telegram.org";

    private final TelegramProperties properties;
    private final RestClient client;

    public TelegramNotifier(TelegramProperties properties) {
        this.properties = properties;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        int ms = (int) properties.timeout().toMillis();
        factory.setConnectTimeout(ms);
        factory.setReadTimeout(ms);
        // baseUrl, not a {placeholder} in the uri template below. A template
        // variable is URL-ENCODED when it is expanded, so passing the host that
        // way produced "https%3A%2F%2Fapi.telegram.org/bot.../sendMessage" -
        // a relative URI, which RestClient rejects with "URI is not absolute".
        this.client = RestClient.builder().baseUrl(API).requestFactory(factory).build();

        if (!properties.configured()) {
            // Once, at boot, rather than on every send. A deployment that never
            // wanted Telegram should not have its logs filled by the fact.
            log.info("Telegram notifications are off - set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to turn them on.");
        }
    }

    /**
     * Send one message to the platform's own admin chat, in Telegram's HTML
     * flavour.
     *
     * <p>Only {@code <b>}, {@code <i>}, {@code <code>}, {@code <a>} and a few
     * others are legal there, and an unbalanced tag makes the whole call fail
     * with a 400 rather than degrading - so callers should build their text
     * with {@link #escape} around anything a user typed.
     *
     * @return true when Telegram accepted it, false on any failure at all.
     */
    public boolean send(String html) {
        if (!properties.configured()) return false;
        return sendToChat(properties.chatId(), html);
    }

    /**
     * Send one message to an arbitrary chat - an organiser's own, once they
     * have connected one, rather than the fixed admin chat {@link #send}
     * always uses.
     *
     * <p>Gated on {@code botToken} alone, not the fuller {@link
     * TelegramProperties#configured()}: sending here has nothing to do with
     * whether an admin chat id is set, and a deployment that has only
     * configured the organiser-facing connect flow should still be able to.
     *
     * @return true when Telegram accepted it, false on any failure at all -
     *         including simply not being configured, same as {@link #send}.
     */
    public boolean sendToChat(String chatId, String html) {
        if (properties.botToken() == null || properties.botToken().isBlank()) return false;
        if (chatId == null || chatId.isBlank()) return false;

        try {
            client.post()
                    .uri("/bot{token}/sendMessage", properties.botToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "chat_id", chatId,
                            "text", html,
                            "parse_mode", "HTML",
                            // The application link is for the admin console, which
                            // is not public - an unfurl attempt would show nothing
                            // and add a dead grey card under every message.
                            "disable_web_page_preview", true))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RuntimeException e) {
            // Deliberately broad, and deliberately terminal. See the class note:
            // the work this describes has already been committed, so there is
            // nothing here worth failing or retrying a transaction over.
            log.warn("Telegram notification not delivered: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Make user-supplied text safe for Telegram's HTML mode.
     *
     * <p>An organisation called {@code Rock & Roll <live>} would otherwise
     * either break the parse or, worse, inject markup into a message an admin
     * reads as the platform's own words.
     */
    public static String escape(String raw) {
        if (raw == null) return "";
        return raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
