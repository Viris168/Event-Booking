package com.eventbooking.controller;

import com.eventbooking.booking.BookingService;
import com.eventbooking.dto.booking.BookingResponse;
import com.eventbooking.dto.booking.CheckoutRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Checkout and a customer's bookings.
 *
 * <p>Added alongside the payment lane because a payment needs something to pay
 * for: the booking service has had checkout since issue #30, but nothing
 * exposed it over HTTP, so the flow could not be exercised end to end.
 *
 * <p>Holds are still the inventory lane's, and have no endpoints yet - see
 * {@code api/dev-seed.sql} for a hold to start from.
 */
@RestController
@RequestMapping("/api/bookings")
@Tag(name = "Bookings", description = "Turning a hold into a booking, and reading bookings back")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Check out - convert a hold into a booking",
            description = """
                    Prices every line from the hold and snapshots both the prices and the
                    FX rate onto the booking, so a later re-pricing cannot change what this
                    customer owes. The booking starts at PENDING_PAYMENT.

                    Idempotent: checking out the same hold twice returns the booking the
                    first call made, rather than a conflict or a second charge.""")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Booking created at PENDING_PAYMENT"),
            @ApiResponse(responseCode = "404", description = "No such hold, or it is not yours", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "409", description = "The hold is no longer active, or a seat was taken", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "410", description = "The hold expired; its inventory has been released", content = @io.swagger.v3.oas.annotations.media.Content)
    })
    public BookingResponse checkout(
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId,
            @Valid @RequestBody CheckoutRequest request) {

        return bookingService.checkout(request, actorUserId);
    }

    @GetMapping("/me")
    @Operation(summary = "The caller's bookings, newest first")
    public List<BookingResponse> myBookings(
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return bookingService.listForUser(actorUserId, page, size);
    }

    @GetMapping("/{bookingId}")
    @Operation(
            summary = "Read one booking",
            description = "Somebody else's booking answers 404 rather than 403, so ids cannot "
                    + "be walked to discover which ones exist.")
    public BookingResponse getBooking(
            @PathVariable Long bookingId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return bookingService.getResponseForUser(bookingId, actorUserId);
    }
}
