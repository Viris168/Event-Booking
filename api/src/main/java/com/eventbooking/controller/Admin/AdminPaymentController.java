package com.eventbooking.controller.Admin;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.dto.admin.AdminPaymentResponse;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.admin.AdminPaymentService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Payment oversight across every organiser.
 *
 * <p>Distinct from OrganizerTransactionController, which answers the same
 * question scoped to one organiser's own events. This one deliberately has no
 * owner filter: its purpose is to find the attempt nobody is watching.
 */
@RestController
@Slf4j
@CrossOrigin
@RequestMapping("/api/v1/admin/payments")
public class AdminPaymentController {

    private final AdminPaymentService adminPaymentService;
    private final AdminResolver adminResolver;

    public AdminPaymentController(AdminPaymentService adminPaymentService, AdminResolver adminResolver) {
        this.adminPaymentService = adminPaymentService;
        this.adminResolver = adminResolver;
    }

    @GetMapping
    public ResponseEntity<List<AdminPaymentResponse>> list(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false) PaymentProvider provider,
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(defaultValue = "false") boolean stuckOnly) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminPaymentService.list(provider, status, stuckOnly), HttpStatus.OK);
    }
}
