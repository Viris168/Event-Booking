package com.eventbooking.controller.Admin;

import com.eventbooking.Enumeration.ContactMessageStatus;
import com.eventbooking.dto.contact.ContactInboxPage;
import com.eventbooking.dto.contact.ContactMessageResponse;
import com.eventbooking.dto.contact.HandleContactMessageRequest;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.contact.ContactService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The support inbox: reading what the public contact form filed, and marking it
 * dealt with.
 *
 * <p>The counterpart to {@link com.eventbooking.controller.ContactController},
 * and split from it for the reason every admin controller here is split from
 * its public half: a different audience and a different authorizer, which is
 * far easier to state against a whole controller than against each method.
 *
 * <p>That split carries more weight than usual in this pair. The public side
 * takes anonymous writes; this side reads names, email addresses and whatever
 * people chose to put in a free-text field. Under {@code /api/v1/admin/**},
 * which SecurityConfig closes to everyone but PLATFORM_ADMIN - so the two
 * halves of one table sit on opposite sides of the strongest boundary in the
 * filter chain.
 *
 * <p>No resolver call in the handlers. Unlike the payout and moderation
 * screens, nothing here writes an audit row the controller has to name the
 * actor in - the service needs the admin id for {@code handled_by} and resolves
 * it itself, so calling {@code requireAdminUserId} here as well would authorize
 * the same caller twice per request.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/admin/contact-messages")
public class AdminContactController {

    private final ContactService contactService;

    public AdminContactController(ContactService contactService) {
        this.contactService = contactService;
    }

    /**
     * One page of the inbox, newest first, with every status count beside it.
     *
     * <p>Paged, unlike the organiser application queue, which returns a bare
     * list. That queue is bounded by how many people want to run events; this
     * one is bounded by how many strangers decide to type something, which is
     * not a number this code gets to choose.
     *
     * <p>Defaults to NEW - the queue an admin opens this screen to work down.
     * Omitting {@code status} gives every message regardless of state, which is
     * the view for finding something answered last week.
     *
     * <p>The counts ride along with the page rather than coming from a second
     * endpoint, unlike {@code /admin/payouts/status-counts}. The difference is
     * that this screen is paged: it already refetches on every page turn, so
     * the counts cost nothing extra, whereas the payout queue would have had to
     * refetch a whole unpaged list to keep three numbers fresh.
     */
    @GetMapping
    @Operation(
            summary = "Read the support inbox",
            description = """
                    Newest first. Omit `status` for every message; the default, `NEW`,
                    is the queue of messages nobody has looked at yet.

                    `counts_by_status` always carries every status, zeros included, so
                    the tab row can render without testing for absent keys.""")
    public ResponseEntity<ContactInboxPage> inbox(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false, defaultValue = "NEW") ContactMessageStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return ResponseEntity.ok(contactService.inbox(actorUserId, status, page, size));
    }

    /**
     * Every message, whatever its status.
     *
     * <p>Its own path because {@link #inbox} defaults {@code status} to NEW,
     * which means an absent parameter there already means something - a client
     * cannot ask for "every status" by leaving one out. The alternative, a
     * magic {@code status=ALL} value, would put a member in
     * {@link ContactMessageStatus} that no row is ever in.
     */
    @GetMapping("/all")
    @Operation(summary = "Read the whole inbox, every status")
    public ResponseEntity<ContactInboxPage> all(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(contactService.inbox(actorUserId, null, page, size));
    }

    /**
     * Move a message along, recording who did it and when.
     *
     * <p>PATCH rather than PUT: the body carries the status and an optional
     * note, not a replacement for the message, and nothing here may edit what
     * the sender wrote. The stored message is evidence of what was said; an
     * endpoint that could rewrite it would make the inbox useless as a record
     * of a complaint.
     *
     * <p>Refuses a move to NEW with 400 INVALID_CONTACT_STATUS - that status
     * means "nobody has looked at this", and the request is somebody looking.
     * OPEN is what returns a message to the queue.
     */
    @PatchMapping("/{id}")
    @Operation(
            summary = "Set a message's status",
            description = """
                    `OPEN`, `CLOSED` or `SPAM`. `NEW` is refused: it means nobody has
                    looked at the message, and this request is somebody looking - use
                    `OPEN` to put one back in the queue.

                    `admin_note` is internal and is never shown to the sender.""")
    public ResponseEntity<ContactMessageResponse> handle(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody HandleContactMessageRequest request) {
        return ResponseEntity.ok(contactService.handle(actorUserId, id, request));
    }
}
