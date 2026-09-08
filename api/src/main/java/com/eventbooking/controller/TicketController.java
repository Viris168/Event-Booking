package com.eventbooking.controller;

import com.eventbooking.dto.ticket.GroupConfirmRequest;
import com.eventbooking.dto.ticket.GroupConfirmResponse;
import com.eventbooking.dto.ticket.GroupPreviewResponse;
import com.eventbooking.dto.ticket.GroupScanRequest;
import com.eventbooking.dto.ticket.CheckInStatsResponse;
import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.dto.ticket.ScanTicketRequest;
import com.eventbooking.dto.ticket.TicketResponse;
import com.eventbooking.dto.ticket.UndoCheckInRequest;
import com.eventbooking.ticket.TicketService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Tickets: the customer's copies, and the gate that spends them.
 *
 * <p>There is no endpoint to <em>create</em> a ticket. They are issued by the
 * system when a booking reaches CONFIRMED, inside the same transaction that
 * settles the payment — a ticket that could be requested is a ticket that could
 * be requested twice.
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Tickets", description = "Issued QR tickets and gate check-in")
public class TicketController {

    private final TicketService ticketService;

    public TicketController(TicketService ticketService) {
        this.ticketService = ticketService;
    }

    @GetMapping("/bookings/{bookingId}/tickets")
    @Operation(
            summary = "The tickets for a booking",
            description = """
                    One entry per admission unit: a 3-seat zone line yields three separately
                    scannable tickets, numbered by `unitSeq`.

                    Empty until the booking is CONFIRMED — tickets are issued at payment,
                    not at checkout.""")
    public List<TicketResponse> ticketsForBooking(
            @PathVariable Long bookingId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return ticketService.listForBooking(bookingId, actorUserId);
    }

    @GetMapping("/tickets/{ticketId}")
    @Operation(summary = "Read one ticket, including its QR payload")
    public TicketResponse getTicket(
            @PathVariable Long ticketId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return ticketService.getForUser(ticketId, actorUserId);
    }

    @GetMapping(value = "/tickets/{ticketId}/qr.svg", produces = "image/svg+xml")
    @Operation(
            summary = "The ticket's QR as an SVG image",
            description = """
                    Drop straight into an `<img>`, a print stylesheet, or a PDF. Vector, so
                    `size` is only the default presentation width — it stays sharp beyond it.

                    Clients that would rather draw the code themselves can use `qrPayload`
                    from the ticket instead.""")
    public ResponseEntity<String> ticketQr(
            @PathVariable Long ticketId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId,
            @Parameter(description = "Presentation size in px; the image is vector regardless")
            @RequestParam(required = false) Integer size) {

        String svg = ticketService.renderQrSvg(ticketId, actorUserId, size);

        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                // A QR is a bearer credential: no shared cache should keep a copy,
                // and the private cache should not hold one past the tab.
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(svg);
    }

    @PostMapping("/tickets/scan")
    @Operation(
            summary = "Scan a ticket at the gate — validates and consumes it",
            description = """
                    Single-use: the first scan to win the row lock is admitted, and every
                    scan after it comes back `ALREADY_CHECKED_IN` with the time of the first.

                    **Always answers 200**, including for a forged, unknown or already-used
                    code — "is this ticket good?" has a valid answer of "no", and a gate app
                    needs one shape to render green or red from. Read `admitted` and
                    `outcome`.

                    The exceptions are all about the *caller*, never the ticket: a 400 if the
                    operator is not a registered user, a 403 if they are not the organiser of
                    `event_id`. Those are answered before the payload is read, so an
                    unauthorized caller cannot use this endpoint to test whether a code is
                    well-formed.""")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "A verdict — check `admitted`, not the status code"),
            @ApiResponse(responseCode = "400", description = "Missing `event_id`, or an operator who is not a registered user"),
            @ApiResponse(responseCode = "403", description = "The operator is not an organiser, or not the organiser of this event"),
            @ApiResponse(responseCode = "404", description = "No such event")
    })
    public ScanResponse scan(
            @Parameter(description = "The gate operator. Must be the organiser of event_id; "
                    + "recorded as checked_in_by", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId,
            @Valid @RequestBody ScanTicketRequest request) {

        return ticketService.scan(request.payload(), request.eventId(), operatorUserId);
    }

    // ------------------------------------------------------------------
    // Group scan: one code, a whole party
    // ------------------------------------------------------------------

    @PostMapping("/tickets/scan/group/preview")
    @Operation(
            summary = "Look up a whole booking from one of its codes — admits nobody",
            description = """
                    A zone line bought for four is four separate QR codes. Scan any one of
                    them here to see the whole party: who they are, how many are already
                    inside, and which seats.

                    **Nothing is consumed and no lock is taken**, so this is safe to call
                    twice or to walk away from. It is the screen a steward reads before
                    deciding how many people are actually standing there — `confirm` is the
                    second, explicit act.

                    Read `admissible`: it is true only when this is a real booking at this
                    gate *and* somebody is still outside.""")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The party's state — check `admissible`"),
            @ApiResponse(responseCode = "403", description = "The operator is not the organiser of this event")
    })
    public GroupPreviewResponse previewGroup(
            @Parameter(description = "The gate operator; must be the organiser of event_id", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId,
            @Valid @RequestBody GroupScanRequest request) {

        return ticketService.previewGroup(request.payload(), request.eventId(), operatorUserId);
    }

    @PostMapping("/tickets/scan/group/confirm")
    @Operation(
            summary = "Admit some or all of a booking from one of its codes",
            description = """
                    `ticket_ids` names exactly who is being let in — not a count. On a mixed
                    booking a count is unsafe: "admit 3" for three standing-area guests would
                    take the first three free tickets in seat order and burn VIP seats, and the
                    holder of that seat is refused an hour later with no explanation.

                    A zone ticket is interchangeable and a seat is not, so the client turns
                    "admit 3 standing" into three ids — it is the side that knows which are
                    which. Ids are resolved against the booking behind the **signed payload**,
                    so naming them reaches nothing.

                    **Any id that is not on this booking, or is already used, refuses the whole
                    call.** Admitting the rest would let a steward who selected three and got
                    two wave three people through.

                    Every ticket on the booking is row-locked for the duration, so two gates
                    scanning two codes from the same party cannot both admit the same seats.""")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "A verdict — check `admitted` and `admittedCount`"),
            @ApiResponse(responseCode = "400", description = "Missing `event_id` or `ticket_ids`, or an unregistered operator"),
            @ApiResponse(responseCode = "403", description = "The operator is not the organiser of this event")
    })
    public GroupConfirmResponse confirmGroup(
            @Parameter(description = "The gate operator; recorded as checked_in_by on every ticket admitted", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId,
            @Valid @RequestBody GroupConfirmRequest request) {

        return ticketService.confirmGroup(
                request.payload(), request.eventId(), request.ticketIds(), operatorUserId);
    }

    // ------------------------------------------------------------------
    // After the door: history, numbers, and putting one back
    // ------------------------------------------------------------------

    @GetMapping("/events/{eventId}/check-ins")
    @Operation(
            summary = "Everyone admitted at this event, most recent first",
            description = """
                    Organiser-only, through the same check as a scan — a guest list is exactly
                    as sensitive as the door it belongs to.

                    Paged. The default of 20 is a screen's worth; a busy gate will want to
                    page rather than pull an evening in one response.""")
    public Page<TicketResponse> checkIns(
            @PathVariable Long eventId,
            @Parameter(description = "The organiser of this event", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return ticketService.checkInsForEvent(eventId, operatorUserId,
                PageRequest.of(page, Math.min(size, 100)));
    }

    @GetMapping("/events/{eventId}/check-in-stats")
    @Operation(
            summary = "Admission progress for this event",
            description = """
                    Issued, admitted, still to come — counted from tickets, because a ticket is
                    what admits a person and a scan is only a record that somebody tried.

                    `refusedScans` is the one number nothing else reports. A refusal writes no
                    ticket row, so a night of forged codes is invisible without it.""")
    public CheckInStatsResponse checkInStats(
            @PathVariable Long eventId,
            @Parameter(description = "The organiser of this event", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId) {

        return ticketService.checkInStats(eventId, operatorUserId);
    }

    @PostMapping("/tickets/{ticketId}/check-in/undo")
    @Operation(
            summary = "Reverse a check-in",
            description = """
                    A steward scanned the wrong person. Until this existed the only remedy was
                    a database console, which in practice meant the mistake stayed.

                    `reason` is required and is written to the audit trail with the operator's
                    id: this is the one gate action that hands an admission back, so an undo
                    with no stated cause is indistinguishable from an abuse of one.

                    The ticket becomes scannable again.""")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The ticket, now un-checked-in"),
            @ApiResponse(responseCode = "403", description = "The operator is not the organiser of this event"),
            @ApiResponse(responseCode = "404", description = "No such ticket at this event"),
            @ApiResponse(responseCode = "409", description = "That ticket was never checked in")
    })
    public TicketResponse undoCheckIn(
            @PathVariable Long ticketId,
            @Parameter(description = "The organiser of this event", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId,
            @Valid @RequestBody UndoCheckInRequest request) {

        return ticketService.undoCheckIn(ticketId, request.eventId(), request.reason(), operatorUserId);
    }
}
