package com.eventbooking.controller;

import com.eventbooking.booking.BookingService;
import com.eventbooking.dto.booking.BookingReasonRequest;
import com.eventbooking.dto.booking.BookingResponse;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.CurrentUserId;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The other half of the refund path: somebody has to answer the requests
 * customers raise through POST /bookings/{id}/refund.
 *
 * <p>Separate from BookingController for the same reason AdminEventController is
 * separate from EventController - a different authorizer and a different
 * audience, which is far easier to express against a whole controller than
 * against three methods interleaved with the customer's own.
 *
 * <p>Modelled on AdminEventController down to the AdminResolver call returning
 * the admin's user id rather than a boolean: every decision here writes a
 * booking_status_history row naming who made it, and fetching the actor
 * separately is how an audit trail ends up with the wrong name in it.
 */
@RestController
@RequestMapping("/api/v1/admin/refunds")
@Tag(name = "Admin · Refunds", description = "Working the refund queue")
public class AdminRefundController {

    private final BookingService bookingService;
    private final AdminResolver adminResolver;

    public AdminRefundController(BookingService bookingService, AdminResolver adminResolver) {
        this.bookingService = bookingService;
        this.adminResolver = adminResolver;
    }

    @GetMapping
    @Operation(
            summary = "The refund queue",
            description = "Bookings sitting at REFUND_REQUESTED, the longest-waiting first.")
    public List<BookingResponse> queue(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        adminResolver.requireAdminUserId(actorUserId);
        return bookingService.listRefundRequests(page, size);
    }

    @PostMapping("/{bookingId}/approve")
    @Operation(
            summary = "Grant a refund",
            description = """
                    Moves the booking to REFUNDED, which is terminal, and puts its seats
                    and zone capacity back on sale.

                    This records the decision; it does not move money. There is no refund
                    call to Bakong or PayWay here and the payment_transaction rows are
                    left intact as the record of what was charged, so settle with the
                    provider out of band.""")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Booking is now REFUNDED"),
            @ApiResponse(responseCode = "403", description = "Not a platform admin", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "404", description = "No such booking", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "409", description = "No open refund request on this booking", content = @io.swagger.v3.oas.annotations.media.Content)
    })
    public BookingResponse approve(
            @PathVariable Long bookingId,
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody(required = false) BookingReasonRequest request) {

        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return bookingService.approveRefund(bookingId, adminUserId,
                request == null ? null : request.reason());
    }

    @PostMapping("/{bookingId}/reject")
    @Operation(
            summary = "Decline a refund",
            description = "Returns the booking to CONFIRMED. Its tickets were never "
                    + "invalidated, so they simply stay valid.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Booking is back at CONFIRMED"),
            @ApiResponse(responseCode = "403", description = "Not a platform admin", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "404", description = "No such booking", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "409", description = "No open refund request on this booking", content = @io.swagger.v3.oas.annotations.media.Content)
    })
    public BookingResponse reject(
            @PathVariable Long bookingId,
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody(required = false) BookingReasonRequest request) {

        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return bookingService.rejectRefund(bookingId, adminUserId,
                request == null ? null : request.reason());
    }
}
