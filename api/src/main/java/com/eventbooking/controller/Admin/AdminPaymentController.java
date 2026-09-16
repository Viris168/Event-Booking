package com.eventbooking.controller.Admin;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.dto.admin.AdminPaymentResponse;
import com.eventbooking.dto.admin.EventPaymentHealthResponse;
import com.eventbooking.dto.admin.PaymentReconcileResponse;
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
            @RequestParam(required = false) Long eventId,
            @RequestParam(defaultValue = "false") boolean stuckOnly) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(
                adminPaymentService.list(provider, status, eventId, stuckOnly), HttpStatus.OK);
    }

    /**
     * Ask the provider about one attempt, now.
     *
     * <p>POST because it is not a read: it can settle a payment, confirm a
     * booking and issue tickets, all downstream of one click. The response says
     * whether the provider was actually contacted - see the record.
     *
     * <p>The admin counterpart to the customer's own /refresh. Same underlying
     * check, same rate floor; the difference is only who is asking and about
     * whose booking.
     */
    @PostMapping("/{id}/reconcile")
    public ResponseEntity<PaymentReconcileResponse> reconcile(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminPaymentService.reconcile(id), HttpStatus.OK);
    }

    /**
     * Attempts, settlements and failures per event, worst first.
     *
     * <p>Its own endpoint rather than a field on the list above, because it
     * answers a question the list cannot: the table shows one filtered view,
     * and "which event is failing to collect" is a comparison across all of
     * them. Folding it into the list would also recompute the whole aggregate
     * every time somebody changed a filter.
     */
    @GetMapping("/by-event")
    public ResponseEntity<List<EventPaymentHealthResponse>> byEvent(@CurrentUserId Long actorUserId) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(adminPaymentService.healthByEvent(), HttpStatus.OK);
    }
}
