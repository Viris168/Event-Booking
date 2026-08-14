package com.eventbooking.controller;

import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.dto.payment.StartPaymentRequest;
import com.eventbooking.payment.PaymentReconciler;
import com.eventbooking.payment.PaymentService;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The pay screen's API.
 *
 * <p>The intended client flow, and the reason each endpoint exists:
 *
 * <ol>
 *   <li>{@code POST /api/bookings/{id}/payments} - render {@code qrPayload} as
 *       a QR image. Calling it again returns the same attempt, so a page reload
 *       is free.</li>
 *   <li>{@code GET /api/payments/{id}} every {@code pollAfterMs} - a plain
 *       database read, cheap enough to sit in a browser timer. The server's own
 *       reconciler is what keeps that row fresh.</li>
 *   <li>Stop when {@code bookingState} reads CONFIRMED, and show the tickets.</li>
 * </ol>
 *
 * <p>{@code POST /api/payments/{id}/refresh} exists for impatience - it forces
 * a provider check rather than waiting for the next sweep - but a client should
 * not use it as its polling loop; it is rate-limited per attempt for that
 * reason.
 *
 * <p><b>X-User-Id is a placeholder.</b> Nothing is secured yet, so the caller
 * identifies itself by header and every ownership check reads it. It becomes
 * the JWT principal the moment the auth lane lands, and the service signatures
 * do not change when it does.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Payments", description = "Bakong KHQR payment attempts and their reconciliation")
public class PaymentController {

    private final PaymentService paymentService;
    private final PaymentReconciler reconciler;

    public PaymentController(PaymentService paymentService, PaymentReconciler reconciler) {
        this.paymentService = paymentService;
        this.reconciler = reconciler;
    }

    @PostMapping("/bookings/{bookingId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            summary = "Start a payment attempt (issue a KHQR)",
            description = """
                    Idempotent: while an attempt is still open and unexpired, this returns
                    that same attempt and the same QR rather than issuing a second one.
                    Two payable QRs for one booking would mean a second payment with
                    nowhere to go.

                    Moves the booking to AWAITING_CONFIRMATION.""")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Attempt open; render qrPayload"),
            @ApiResponse(responseCode = "404", description = "No such booking, or it is not yours", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "409", description = "Already paid, or the booking cannot take money", content = @io.swagger.v3.oas.annotations.media.Content),
            @ApiResponse(responseCode = "501", description = "Provider not implemented (ABA_PAYWAY)", content = @io.swagger.v3.oas.annotations.media.Content)
    })
    public PaymentResponse startPayment(
            @PathVariable Long bookingId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId,
            @Valid @RequestBody StartPaymentRequest request) {

        return paymentService.startPayment(bookingId, request.provider(), actorUserId);
    }

    @GetMapping("/bookings/{bookingId}/payments")
    @Operation(
            summary = "List a booking's payment attempts",
            description = "Newest first. A booking may have several - a QR that expired, a "
                    + "retry - but at most one can ever be SUCCESS.")
    public List<PaymentResponse> listAttempts(
            @PathVariable Long bookingId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return paymentService.listForBooking(bookingId, actorUserId);
    }

    @GetMapping("/payments/{paymentId}")
    @Operation(
            summary = "Read one attempt - the polling endpoint",
            description = """
                    A database read; it does not call Bakong. The background reconciler is
                    what keeps the row current, which is why a client can poll this on a
                    short timer without touching the provider's rate limit.

                    Poll while `open` is true, waiting `pollAfterMs` between calls, and
                    stop when `bookingState` reads CONFIRMED.""")
    public PaymentResponse getPayment(
            @PathVariable Long paymentId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return paymentService.getForUser(paymentId, actorUserId);
    }

    @PostMapping("/payments/{paymentId}/refresh")
    @Operation(
            summary = "Ask Bakong about this attempt right now",
            description = """
                    Skips the wait for the next sweep. Rate-limited per attempt: inside
                    that window it returns what the database already knows, so hammering
                    it cannot push the shared Bakong token into its rate limit.

                    For a client's steady-state polling, use GET /api/payments/{id}.""")
    public PaymentResponse refreshPayment(
            @PathVariable Long paymentId,
            @Parameter(description = "Stand-in for the authenticated user until JWT lands", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return reconciler.refresh(paymentId, actorUserId);
    }
}
