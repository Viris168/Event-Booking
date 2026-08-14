package com.eventbooking.controller;

import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.payment.PaymentReconciler;
import com.eventbooking.payment.PaymentService;
import com.eventbooking.payment.bakong.BakongClient;
import com.eventbooking.payment.bakong.MockBakongClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Drives the payment flow by hand while there is no Bakong merchant account -
 * the API equivalent of the "simulate" buttons on the web prototype's pay
 * screen.
 *
 * <p><b>Only registered in MOCK mode.</b> The moment {@code BAKONG_MODE=LIVE}
 * is set these endpoints stop existing, so there is no build in which a caller
 * can declare a real booking paid.
 *
 * <p>What they simulate is narrow, and that is the point: the money arriving,
 * and the clock running out. Everything downstream - reconciling, settling,
 * confirming the booking, releasing inventory - is the real code path, so a
 * flow tested here is a flow that works against the real provider.
 */
@RestController
@RequestMapping("/api/dev/payments")
@ConditionalOnProperty(prefix = "app.payment.bakong", name = "mode", havingValue = "MOCK", matchIfMissing = true)
@Tag(name = "Payments (simulation)",
        description = "MOCK mode only. Stands in for a customer scanning the QR, or walking away from it.")
public class PaymentSimulationController {

    private final PaymentService paymentService;
    private final PaymentReconciler reconciler;
    private final BakongClient bakongClient;

    public PaymentSimulationController(PaymentService paymentService,
                                       PaymentReconciler reconciler,
                                       BakongClient bakongClient) {
        this.paymentService = paymentService;
        this.reconciler = reconciler;
        this.bakongClient = bakongClient;
    }

    @PostMapping("/{paymentId}/pay")
    @Operation(
            summary = "Pretend the customer scanned and paid this QR",
            description = """
                    Tells the mock provider the money is in, then runs a real reconcile.
                    The booking should come back CONFIRMED.

                    Call it twice: the second call is the double-confirm case the whole
                    design guards against, and it must leave the booking exactly as it
                    was - one SUCCESS row, one CONFIRMED transition, no second history
                    entry.""")
    public PaymentResponse simulatePayment(
            @PathVariable Long paymentId,
            @Parameter(description = "Must own the booking", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        PaymentResponse current = paymentService.getForUser(paymentId, actorUserId);

        if (current.open()) {
            mock().settle(current.providerRef());
            reconciler.reconcileNow(paymentId);
        }
        return paymentService.getForUser(paymentId, actorUserId);
    }

    @PostMapping("/{paymentId}/expire")
    @Operation(
            summary = "Pretend the QR's clock ran out",
            description = """
                    The timeout path: the attempt goes EXPIRED and the booking drops back
                    to PAYMENT_FAILED - which is not terminal, so the customer still holds
                    their seats and can start a fresh QR.

                    Seats only go back on sale when the booking's own payment window
                    lapses, which is the other sweep in PaymentPoller.""")
    public PaymentResponse simulateExpiry(
            @PathVariable Long paymentId,
            @Parameter(description = "Must own the booking", example = "1")
            @RequestHeader("X-User-Id") Long actorUserId) {

        return paymentService.expireAttemptNow(paymentId, actorUserId);
    }

    private MockBakongClient mock() {
        if (bakongClient instanceof MockBakongClient mockClient) {
            return mockClient;
        }
        // Unreachable while the @ConditionalOnProperty above holds - but if
        // someone rewires the bean, failing loudly beats silently doing nothing.
        throw new IllegalStateException(
                "Simulation endpoints need the mock Bakong client, but the live one is wired in.");
    }
}
