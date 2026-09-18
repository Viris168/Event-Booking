package com.eventbooking.controller;

import com.eventbooking.dto.contact.ContactMessageReceipt;
import com.eventbooking.dto.contact.ContactMessageRequest;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.contact.ContactService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public contact form.
 *
 * <p><b>The only write in this application reachable without a token.</b> That
 * is deliberate, and it is worth stating plainly because every other controller
 * here begins by resolving the caller into an organiser or an admin. This one
 * cannot: the people most likely to need it are the ones who cannot sign in -
 * somebody whose ticket never arrived, somebody locked out of the account the
 * booking is under. Requiring authentication would close the door precisely to
 * the people knocking on it.
 *
 * <p>What stands in for the token is {@code ContactRateLimiter} plus the size
 * caps on {@link ContactMessageRequest}. Neither is as good as authentication
 * and neither is pretending to be; together they bound what an anonymous caller
 * can cost us.
 *
 * <p>There is no GET here. Messages are read through
 * {@link com.eventbooking.controller.Admin.AdminContactController}, behind the
 * {@code /api/v1/admin/**} role gate - a public endpoint that could read back
 * what it wrote would be an open mailbox rather than a contact form, since the
 * ids are sequential and anyone could walk them.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/contact")
public class ContactController {

    private final ContactService contactService;

    public ContactController(ContactService contactService) {
        this.contactService = contactService;
    }

    /**
     * Send a message to platform support.
     *
     * <p>{@code optional = true} on the actor is the whole shape of this
     * endpoint: a signed-in sender is recorded, an anonymous one is the normal
     * case, and neither is turned away. The id is never read from the body -
     * the same rule the rest of the application follows, and here it matters
     * more than usual, since a body field naming the sender would let anyone
     * attribute a message to any account.
     *
     * <p>201 with a receipt, not with the stored row. See
     * {@link ContactMessageReceipt} for why a public endpoint should hand back
     * as little as it can get away with.
     *
     * <p>Fails with 429 TOO_MANY_CONTACT_MESSAGES when the address or the
     * reply-to has been over the limit, carrying {@code retry_after_seconds}.
     */
    @PostMapping
    @Operation(
            summary = "Send a message to platform support",
            description = """
                    Open to anyone - no token required. If a valid one IS present the
                    sender's account is recorded alongside the message, but nothing on
                    this path requires it.

                    `sender_name` and `reply_to` are stored exactly as typed, even for a
                    signed-in sender: somebody writing about a relative's booking gives
                    that person's details, and overwriting them from the session would
                    route the reply to the wrong person.

                    Rate limited per network address and per reply-to address. `429`
                    carries `retry_after_seconds` in `details`.""")
    public ResponseEntity<ContactMessageReceipt> submit(
            @CurrentUserId(optional = true) Long senderUserId,
            @Valid @RequestBody ContactMessageRequest request,
            HttpServletRequest http) {

        return new ResponseEntity<>(
                contactService.submit(senderUserId, http.getRemoteAddr(), request),
                HttpStatus.CREATED);
    }
}
