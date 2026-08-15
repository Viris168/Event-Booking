package com.eventbooking.controller;

import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.dto.ticket.ScanTicketRequest;
import com.eventbooking.dto.ticket.TicketResponse;
import com.eventbooking.ticket.TicketService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
@RequestMapping("/api")
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
                    `outcome`; only a malformed *request* is a 4xx.

                    Pass `eventId`: without it, a genuine ticket for a different event is
                    admitted.""")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "A verdict — check `admitted`, not the status code")
    })
    public ScanResponse scan(
            @Parameter(description = "The gate operator; recorded as checked_in_by", example = "1")
            @RequestHeader("X-User-Id") Long operatorUserId,
            @Valid @RequestBody ScanTicketRequest request) {

        return ticketService.scan(request.payload(), request.eventId(), operatorUserId);
    }
}
