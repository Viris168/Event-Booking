package com.eventbooking.controller;

import com.eventbooking.config.TelegramProperties;
import com.eventbooking.service.Organizer.OrganizerTelegramService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Where Telegram itself talks to this app - the one controller in the
 * codebase a JWT can never carry, because the caller is Telegram's servers,
 * not a browser holding one of ours.
 *
 * <p><b>Public on purpose</b>, see {@code SecurityConfig}'s one permitAll
 * entry for this exact path - and guarded instead by the {@code
 * X-Telegram-Bot-Api-Secret-Token} header Telegram echoes back on every call
 * once you register it via {@code setWebhook}'s {@code secret_token}
 * parameter. A caller that does not know the secret gets a 401 before a
 * single field of the body is read.
 *
 * <p>The body is read as a raw {@code Map} rather than bound to a typed
 * Update DTO. Telegram's Update schema is large - messages, edits, callback
 * queries, polls, and more, most of them fields this app will never act on -
 * and modelling all of it just to reach the two or three fields {@code
 * OrganizerTelegramService} actually reads would be a maintenance burden with
 * no reader. Should a richer feature need more of the payload later, that is
 * the moment to introduce a proper DTO for the fields that feature needs.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/telegram")
public class TelegramWebhookController {

    private final OrganizerTelegramService organizerTelegramService;
    private final TelegramProperties properties;

    public TelegramWebhookController(OrganizerTelegramService organizerTelegramService,
                                     TelegramProperties properties) {
        this.organizerTelegramService = organizerTelegramService;
        this.properties = properties;
    }

    @PostMapping("/webhook")
    public ResponseEntity<Void> webhook(
            @RequestHeader(value = "X-Telegram-Bot-Api-Secret-Token", required = false) String secret,
            @RequestBody Map<String, Object> update) {

        if (!properties.webhookConfigured() || !properties.webhookSecret().equals(secret)) {
            // Same message either way - configured-but-wrong and
            // not-configured-at-all should look identical to whoever is
            // probing this endpoint.
            log.warn("Rejected a Telegram webhook call with a missing or wrong secret token");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        organizerTelegramService.handleWebhookUpdate(update);
        // 200 regardless of what handleWebhookUpdate actually did - it never
        // throws (see its own doc), and telling Telegram anything but success
        // makes it retry the same update, which a already-redeemed /start
        // token would then just fail to match a second time for no reason.
        return ResponseEntity.ok().build();
    }
}
