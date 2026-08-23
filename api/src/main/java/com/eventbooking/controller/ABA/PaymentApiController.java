package com.eventbooking.controller.ABA;


import com.eventbooking.common.error.PaymentGatewayException;
import com.eventbooking.service.ABAPay.PaymentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/payment")
@CrossOrigin
public class PaymentApiController {

    private final PaymentService paymentService;

    public PaymentApiController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }


    /**
     * Closes a locally pending PayWay transaction. ABA is called before the local record is
     * marked CLOSED, so a payment is never released locally while PayWay can still accept it.
     */
    @PostMapping("/close-transaction/{tranId}")
    public ResponseEntity<?> closeTransaction(@PathVariable String tranId) {
        try {
            Map<String, Object> result = paymentService.closeTransaction(tranId);
            return Boolean.TRUE.equals(result.get("closed"))
                    ? ResponseEntity.ok(result)
                    : ResponseEntity.status(409).body(result);
        } catch (PaymentGatewayException e) {
            return ResponseEntity.status(502).body(Map.of("closed", false, "message", e.getMessage()));
        }
    }

    // ─── Create QR ────────────────────────────────────────────────────────────

    @PostMapping("/create-qr")
    public ResponseEntity<?> createQrPayment(@RequestBody(required = false) Map<String, Object> requestPayload) {
        try {
            return ResponseEntity.ok(paymentService.createQrPayment(requestPayload));
        } catch (PaymentGatewayException e) {
            return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            // The reason is carried through rather than flattened to "invalid":
            // "Booking 9 is CONFIRMED and cannot take a payment" is something a
            // pay screen can act on, and none of these messages say anything a
            // caller does not already know about its own request.
            return ResponseEntity.badRequest().body(Map.of(
                    "error", e.getMessage() == null ? "Invalid payment request" : e.getMessage()));
        }
    }


    @GetMapping("/check-status/{tranId}")
    public ResponseEntity<?> checkTransactionStatus(@PathVariable String tranId) {
        try {
            return ResponseEntity.ok(paymentService.checkTransactionStatus(tranId));
        } catch (PaymentGatewayException e) {
            return ResponseEntity.status(502).body(Map.of("paid", false, "message", e.getMessage()));
        }
    }


    @GetMapping("/transaction-detail/{tranId}")
    public ResponseEntity<?> getTransactionDetail(@PathVariable String tranId) {
        try {
            return ResponseEntity.ok(paymentService.getTransactionDetails(tranId));
        } catch (PaymentGatewayException e) {
            return ResponseEntity.status(502).body(Map.of("closed", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/transaction-detail")
    public ResponseEntity<?> getall(){
        try {
            return ResponseEntity.ok(paymentService.getAllTransactions());
        } catch (PaymentGatewayException e) {
            return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
        }
    }


}
