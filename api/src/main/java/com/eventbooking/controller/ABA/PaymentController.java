package com.eventbooking.controller.ABA;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;

@Controller("abaPaymentController")
@CrossOrigin
public class PaymentController {

    @GetMapping("/checkout")
    public String showCheckout() {
        // Simply render the checkout page — the QR is generated
        // via the /api/payment/create-qr REST endpoint
        return "checkout";
    }
}
