package com.eventbooking.controller.Notification;

import com.eventbooking.dto.notification.NotificationResponse;
import com.eventbooking.dto.notification.UnreadCountResponse;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.notification.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * One inbox, every role.
 *
 * <p>There is no admin variant of this controller and no {@code /organizer}
 * prefix, which is why it needs no entry in {@code SecurityConfig}: it falls
 * under {@code anyRequest().authenticated()}, and every method scopes its work
 * to {@code @CurrentUserId}. A customer, an organiser and an admin call the same
 * four endpoints and each sees only what was addressed to them - the role
 * decided what got written, not who may read it back.
 *
 * <p>Nothing here creates a notification. They are written by the domain, after
 * the transaction that made them true, and an endpoint that let a client post
 * one would let any signed-in user tell any other user that their payment had
 * gone through.
 */
@RestController
@RequestMapping("/api/v1/notifications")
@Tag(name = "Notifications", description = "The signed-in user's inbox")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    @Operation(
            summary = "The caller's notifications, newest first",
            description = """
                    Returns a Spring Page, so the client reads `content` and `total_elements`.

                    No `message` field by design: a row carries a `type` and the `params` the
                    sentence needs, and the client renders it in whichever language the viewer
                    has selected. `size` is capped server-side at 100.""")
    public Page<NotificationResponse> list(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @CurrentUserId Long actorUserId) {

        return notificationService.inbox(actorUserId, unreadOnly, page, size);
    }

    @GetMapping("/unread-count")
    @Operation(
            summary = "How many are unread",
            description = """
                    Separate from the list because it is polled on a timer and the list is not.
                    Counting from a partial index costs one number; fetching a page to count it
                    in the browser would cost twenty rows every poll, for every session.""")
    public UnreadCountResponse unreadCount(@CurrentUserId Long actorUserId) {
        return new UnreadCountResponse(notificationService.unreadCount(actorUserId));
    }

    @PatchMapping("/{id}/read")
    @Operation(
            summary = "Mark one as read",
            description = """
                    Idempotent: marking an already-read notification read keeps the original
                    timestamp and answers 200. A notification belonging to somebody else
                    answers 404 rather than 403 - a 403 would confirm the row exists.""")
    public NotificationResponse markRead(@PathVariable Long id, @CurrentUserId Long actorUserId) {
        return notificationService.markRead(actorUserId, id);
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark the whole inbox read", description = "Returns how many rows that touched.")
    public ResponseEntity<Map<String, Integer>> markAllRead(@CurrentUserId Long actorUserId) {
        return ResponseEntity.ok(Map.of("marked", notificationService.markAllRead(actorUserId)));
    }
}
