package com.eventbooking.controller;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.payment.PaymentService;
import com.eventbooking.repository.PaymentTransactionRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Stands in for ABA approving a PayWay transaction, so the checkout's
 * "simulate success" button produces a genuinely confirmed booking and real,
 * scannable tickets rather than only a green screen.
 *
 * <p><b>Only registered when {@code payway.mode} is MOCK.</b> This endpoint
 * confirms a booking without any money having moved, so in LIVE it does not
 * exist at all - the same arrangement the Bakong lane uses for
 * {@code /api/dev/payments/**}.
 *
 * <p>What it simulates is narrow, deliberately: the approval itself. Everything
 * after it - confirming the booking, issuing the tickets - is the same code the
 * real check-transaction path runs, so a flow tested here is a flow that works
 * against the real gateway.
 */
@RestController
@RequestMapping("/api/v1/dev/payway")
@ConditionalOnProperty(prefix = "payway", name = "mode", havingValue = "MOCK", matchIfMissing = true)
@Tag(name = "Payments (PayWay simulation)",
        description = "MOCK mode only. Stands in for ABA approving a transaction.")
public class PaywaySimulationController {

    private final PaymentTransactionRepository paymentTransactionRepository;
    private final PaymentService paymentService;

    public PaywaySimulationController(PaymentTransactionRepository paymentTransactionRepository,
                                      PaymentService paymentService) {
        this.paymentTransactionRepository = paymentTransactionRepository;
        this.paymentService = paymentService;
    }

    @PostMapping("/{tranId}/pay")
    @Operation(
            summary = "Pretend ABA approved this transaction",
            description = """
                    Finds the PaymentTransaction by its ABA tran_id (providerRef), then
                    settles it through the unified PaymentService — confirming the booking
                    and issuing tickets.

                    Idempotent, like the real path: calling it twice confirms once and
                    issues each ticket once.""")
    public ResponseEntity<?> pay(@PathVariable String tranId) {
        PaymentTransaction attempt = paymentTransactionRepository
                .findByProviderAndProviderRef(PaymentProvider.ABA_PAYWAY, tranId)
                .orElse(null);

        if (attempt == null) {
            return ResponseEntity.status(404).body(Map.of("paid", false, "message", "Unknown transaction"));
        }

        if (attempt.getStatus() == PaymentStatus.SUCCESS) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("paid", true);
            body.put("message", "Already settled");
            body.put("bookingId", attempt.getBooking().getId());
            body.put("bookingState", attempt.getBooking().getState().name());
            return ResponseEntity.ok(body);
        }

        // Simulate ABA approval by calling the shared settle path.
        // This confirms the booking and issues tickets — same as the real flow.
        paymentService.simulateAbaApproval(attempt.getId());

        // Re-read after settlement
        attempt = paymentTransactionRepository.findById(attempt.getId()).orElseThrow();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("paid", true);
        body.put("message", "Simulated PayWay approval");
        body.put("bookingId", attempt.getBooking().getId());
        body.put("bookingState", attempt.getBooking().getState().name());
        return ResponseEntity.ok(body);
    }
}
