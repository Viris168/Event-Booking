package com.eventbooking.controller;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.model.ABA.BankPaymentRequest;
import com.eventbooking.payment.PaywaySettlementService;
import com.eventbooking.repository.ABARepository;
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
@RequestMapping("/api/dev/payway")
@ConditionalOnProperty(prefix = "payway", name = "mode", havingValue = "MOCK", matchIfMissing = true)
@Tag(name = "Payments (PayWay simulation)",
        description = "MOCK mode only. Stands in for ABA approving a transaction.")
public class PaywaySimulationController {

    private final ABARepository paymentRepository;
    private final PaywaySettlementService settlementService;

    public PaywaySimulationController(ABARepository paymentRepository,
                                      PaywaySettlementService settlementService) {
        this.paymentRepository = paymentRepository;
        this.settlementService = settlementService;
    }

    @PostMapping("/{tranId}/pay")
    @Operation(
            summary = "Pretend ABA approved this transaction",
            description = """
                    Marks the local PayWay record PAID, confirms the booking it was opened
                    for, and issues that booking's tickets.

                    Idempotent, like the real path: calling it twice confirms once and
                    issues each ticket once.""")
    public ResponseEntity<?> pay(@PathVariable String tranId) {
        BankPaymentRequest payment = paymentRepository.findById(tranId).orElse(null);
        if (payment == null) {
            return ResponseEntity.status(404).body(Map.of("paid", false, "message", "Unknown transaction"));
        }

        BookingStatus state = settlementService.settle(payment.getBookingId(), tranId);

        payment.setPaymentStatus("PAID");
        paymentRepository.save(payment);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("paid", true);
        body.put("message", "Simulated PayWay approval");
        body.put("bookingId", payment.getBookingId());
        body.put("bookingState", state == null ? null : state.name());
        return ResponseEntity.ok(body);
    }
}
