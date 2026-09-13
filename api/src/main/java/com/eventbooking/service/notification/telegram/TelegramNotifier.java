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
 * <p>One method, deliberately. This is not a Telegram client - it is the single
 * outbound call the platform makes to say "a human should look at this", and
 * keeping it to {@code sendMessage} means there is no surface here to grow a
 * polling loop or a webhook handler by accident.
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
        this.client = RestClient.builder().requestFactory(factory).build();

        if (!properties.configured()) {
            // Once, at boot, rather than on every send. A deployment that never
            // wanted Telegram should not have its logs filled by the fact.
            log.info("Telegram notifications are off - set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to turn them on.");
        }
    }

    /**
     * Send one message, in Telegram's HTML flavour.
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

        try {
            client.post()
                    .uri("{api}/bot{token}/sendMessage", API, properties.botToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "chat_id", properties.chatId(),
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
