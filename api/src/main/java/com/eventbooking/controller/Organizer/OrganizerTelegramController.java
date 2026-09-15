package com.eventbooking.controller.Organizer;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Organizer.OrganizerTelegramService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * The organiser-facing half of "Connect Telegram". Everything here runs
 * under the caller's own session, same as {@link OrganizerController} - the
 * reverse direction, Telegram calling this app, is {@code
 * TelegramWebhookController}, a completely separate (and public) endpoint.
 */
@RestController
@CrossOrigin
@RequestMapping("/api/v1/organizer/telegram")
public class OrganizerTelegramController {

    private final OrganizerTelegramService telegramService;
    private final OrganizerResolver organizerResolver;

    public OrganizerTelegramController(OrganizerTelegramService telegramService,
                                       OrganizerResolver organizerResolver) {
        this.telegramService = telegramService;
        this.organizerResolver = organizerResolver;
    }

    /** Whether this organiser has ever connected a Telegram chat. */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Boolean>> status(@CurrentUserId Long actorUserId) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.ok(Map.of("connected", telegramService.isConnected(organizerId)));
    }

    /**
     * A fresh 10-minute deep link. 409 rather than a null/empty body when the
     * bot has no username configured - a silent dead link is a worse failure
     * than a clear one.
     */
    @PostMapping("/connect-link")
    public ResponseEntity<?> connectLink(@CurrentUserId Long actorUserId) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        String link = telegramService.connectLink(organizerId);
        if (link == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("detail", "Telegram is not configured on this server."));
        }
        return ResponseEntity.ok(Map.of("deepLink", link));
    }

    @PostMapping("/disconnect")
    public ResponseEntity<Void> disconnect(@CurrentUserId Long actorUserId) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        telegramService.disconnect(organizerId);
        return ResponseEntity.noContent().build();
    }
}
