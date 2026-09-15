package com.eventbooking.controller.Organizer;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.dto.payout.CreatePayoutRequest;
import com.eventbooking.dto.payout.PayableEventResponse;
import com.eventbooking.dto.payout.PayoutRequestResponse;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.payout.PayoutService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The organiser's side of getting paid.
 *
 * <p>Modelled on {@link OrganizerTransactionController}, down to its central
 * decision: there is no organizerId parameter anywhere here. The scope comes
 * from the caller's token via {@link OrganizerResolver}, so claiming another
 * organiser's event is unrepresentable rather than merely rejected - the same
 * reasoning that removed organizerId from CreateEventRequest.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/organizer/payouts")
public class OrganizerPayoutController {

    private final PayoutService payoutService;
    private final OrganizerResolver organizerResolver;

    public OrganizerPayoutController(PayoutService payoutService,
                                     OrganizerResolver organizerResolver) {
        this.payoutService = payoutService;
        this.organizerResolver = organizerResolver;
    }

    /**
     * Finished events this organiser could claim, with what each is worth.
     *
     * <p>A separate endpoint from the list below rather than a flag on it,
     * because the two return different things: this is a quote computed live
     * from bookings, that is a list of invoices whose numbers were frozen when
     * they were written. Merging them would hide exactly the distinction the
     * snapshot exists to make.
     */
    @GetMapping("/payable")
    public ResponseEntity<List<PayableEventResponse>> payable(@CurrentUserId Long actorUserId) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.ok(payoutService.payable(organizerId));
    }

    /**
     * Claim one finished event.
     *
     * <p>POST and 201: this creates a row the caller can address afterwards, at
     * the id in the response - unlike the admin decisions, which PATCH an
     * existing one into a new state.
     */
    @PostMapping
    public ResponseEntity<PayoutRequestResponse> request(
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody CreatePayoutRequest request) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(payoutService.request(organizerId, request), HttpStatus.CREATED);
    }

    /**
     * This organiser's payouts, newest first.
     *
     * <p>{@code status} is optional and defaults to all of them, unlike the
     * admin queue which defaults to REQUESTED. An organiser opens this to see
     * where their money is, and a rejected request is the only place the reason
     * they were refused is written down.
     */
    @GetMapping
    public ResponseEntity<List<PayoutRequestResponse>> list(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false) PayoutStatus status) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.ok(payoutService.listForOrganizer(organizerId, status));
    }

    /**
     * One payout - what the printable invoice page reads.
     *
     * <p>Scoped to the owner, and a miss reports 404 rather than 403. Invoice
     * numbers are sequential by design, so confirming that an id exists would
     * let anyone walk the run and learn how often other organisers are paid.
     */
    @GetMapping("/{id}")
    public ResponseEntity<PayoutRequestResponse> get(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.ok(payoutService.getForOrganizer(organizerId, id));
    }
}
