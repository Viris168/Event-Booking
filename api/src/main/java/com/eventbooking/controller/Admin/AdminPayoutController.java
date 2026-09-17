package com.eventbooking.controller.Admin;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.dto.payout.ExtractedReceiptResponse;
import com.eventbooking.dto.payout.MarkPaidRequest;
import com.eventbooking.dto.payout.PayoutRequestResponse;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.payout.PayoutService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Deciding payouts. The admin half of the flow.
 *
 * <p>Modelled on {@code AdminOrganizerApplicationController}, down to the
 * resolver call: every method begins by turning the caller into a confirmed
 * admin id and passes that id down rather than the raw {@code actorUserId}.
 * Every action here writes a {@code reviewedBy}, and fetching the actor
 * separately from the authorization check is how an audit trail ends up naming
 * the wrong person - which matters more on a screen that moves money than on
 * one that does not.
 *
 * <p>Under {@code /api/v1/admin/...}: one prefix, one audience, one rule,
 * expressible against the whole controller if a SecurityFilterChain matcher
 * ever needs to.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/admin/payouts")
public class AdminPayoutController {

    private final PayoutService payoutService;
    private final AdminResolver adminResolver;

    public AdminPayoutController(PayoutService payoutService, AdminResolver adminResolver) {
        this.payoutService = payoutService;
        this.adminResolver = adminResolver;
    }

    /**
     * One status' worth of payouts, longest wait first.
     *
     * <p>Defaults to REQUESTED, which is the queue an admin opens this screen to
     * work down. APPROVED is the second queue and the one easiest to forget: it
     * holds money the platform has agreed to send and has not sent, which is a
     * state nobody is chasing unless the screen shows it.
     *
     * <p>There is no refuse endpoint. An admin who does not intend to pay a
     * request leaves it in REQUESTED; nothing in the flow forces a decision.
     */
    @GetMapping
    public ResponseEntity<List<PayoutRequestResponse>> queue(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "REQUESTED") PayoutStatus status) {
        adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(payoutService.queue(status));
    }

    /**
     * How many payouts sit in each status - the numbers on the tabs.
     *
     * <p>Its own endpoint rather than a field on the queue response, for the
     * reason the applications screen gives: the tabs have to show every count
     * while the list shows one status, and polling the list to keep three
     * numbers fresh would refetch every payout in it.
     */
    @GetMapping("/status-counts")
    public ResponseEntity<Map<PayoutStatus, Long>> statusCounts(@CurrentUserId Long actorUserId) {
        adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(payoutService.countsByStatus());
    }

    /**
     * One payout in full, including the unmasked account number.
     *
     * <p>The list masks it to the last four digits; this does not. An admin
     * about to make a transfer needs to read the number, and the masking exists
     * to keep a screenful of bank accounts out of a screenshot, not to withhold
     * one from the person doing the paying.
     */
    @GetMapping("/{id}")
    public ResponseEntity<PayoutRequestResponse> get(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(payoutService.getForAdmin(id));
    }

    /**
     * Agree that the platform owes this. No money moves.
     *
     * <p>No request body - an approval has nothing to explain, the same reason
     * the application and event approvals take none.
     *
     * <p>PATCH rather than POST: this moves an existing row to a new state
     * rather than creating anything the caller can address afterwards.
     */
    @PatchMapping("/{id}/approve")
    public ResponseEntity<PayoutRequestResponse> approve(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(payoutService.approve(adminUserId, id));
    }

    /**
     * Record that the transfer happened.
     *
     * <p>The body is mandatory and {@code @Valid} is what enforces it: without
     * the annotation a blank reference reaches
     * {@code payout_request_paid_consistent} and comes back as a raw constraint
     * violation - a 500 where the admin deserved "reference is required".
     *
     * <p>Only legal from APPROVED. The service refuses the jump from REQUESTED
     * rather than treating it as a convenience, because "somebody agreed to the
     * amount before somebody sent it" is the entire reason the two states exist.
     */
    @PatchMapping("/{id}/mark-paid")
    public ResponseEntity<PayoutRequestResponse> markPaid(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody MarkPaidRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(
                payoutService.markPaid(adminUserId, id, request.reference(), request.note()));
    }

    /**
     * Read the bank reference off a transfer confirmation screenshot.
     *
     * <p><b>Nothing is saved - not the image, and not what was read from it.</b>
     * This is a typing aid for the form above: the response prefills the
     * reference box, the admin checks it against the screenshot still open in
     * their banking app, and {@code mark-paid} is what actually records
     * anything. An admin who would rather type, or who is working on a
     * deployment with no vision key configured, loses nothing.
     *
     * <p>Admin-only by the {@code /api/v1/admin/**} rule in SecurityConfig,
     * like every sibling here, and narrowed further by the service to payouts
     * that are actually APPROVED.
     *
     * <p>{@code @RequestParam}, not {@code @RequestBody}: this is multipart, and
     * the part is named {@code image} to match what the browser sends.
     */
    @PostMapping(value = "/{id}/extract-receipt", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ExtractedReceiptResponse> extractReceipt(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @RequestParam("image") MultipartFile image) {
        adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(payoutService.extractReceipt(id, image));
    }
}
