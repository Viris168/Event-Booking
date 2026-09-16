package com.eventbooking.controller.Organizer;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.dto.booking.MonthlyRevenueResponse;
import com.eventbooking.dto.booking.OrganizerTransactionResponse;
import com.eventbooking.dto.booking.OrganizerTransactionSummaryResponse;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.booking.OrganizerTransactionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Slf4j
@CrossOrigin
@RequestMapping("/api/v1/organizer/transaction")
public class OrganizerTransactionController {

    private final OrganizerTransactionService organizerTransactionService;
    private final OrganizerResolver organizerResolver;

    public OrganizerTransactionController(OrganizerTransactionService organizerTransactionService,
                                          OrganizerResolver organizerResolver) {
        this.organizerTransactionService = organizerTransactionService;
        this.organizerResolver = organizerResolver;
    }

    /**
     * The organiser's own transactions.
     *
     * <p>There is deliberately no organizerId parameter. The scope comes from
     * the caller, so asking for someone else's customers is unrepresentable
     * rather than merely rejected - the same reasoning that removed organizerId
     * from CreateEventRequest.
     */
    /**
     * The dashboard's revenue chart, as twelve numbers rather than five hundred
     * bookings. Empty months come back as zero, so the client draws the axis
     * straight from the response.
     */
    @GetMapping("/monthly")
    public ResponseEntity<List<MonthlyRevenueResponse>> monthlyRevenue(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "12") int months) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(
                organizerTransactionService.monthlyRevenue(organizerId, months), HttpStatus.OK);
    }

    /**
     * The heading's figures, for the same filters the list takes. Deliberately
     * not derived from the page - see the service.
     */
    @GetMapping("/summary")
    public ResponseEntity<OrganizerTransactionSummaryResponse> summary(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false) Long eventId,
            @RequestParam(required = false) BookingStatus state,
            @RequestParam(required = false) PaymentProvider provider) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(
                organizerTransactionService.summaryForOrganizer(organizerId, eventId, state, provider),
                HttpStatus.OK);
    }

    @GetMapping
    public ResponseEntity<Page<OrganizerTransactionResponse>> list(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false) Long eventId,
            @RequestParam(required = false) BookingStatus state,
            /*
             * The provider of the booking's most recent attempt - the same one
             * the row prints. See BookingRepository.findForOrganizer for why it
             * is the latest attempt rather than any attempt.
             */
            @RequestParam(required = false) PaymentProvider provider,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(
                organizerTransactionService.listForOrganizer(
                        organizerId, eventId, state, provider, page, size),
                HttpStatus.OK);
    }
}
