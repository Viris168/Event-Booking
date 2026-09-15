package com.eventbooking.service.payout.impl;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.config.PayoutProperties;
import com.eventbooking.dto.payout.CreatePayoutRequest;
import com.eventbooking.dto.payout.PayableEventResponse;
import com.eventbooking.dto.payout.PayoutRequestResponse;
import com.eventbooking.exception.catalog.EventNotFoundException;
import com.eventbooking.exception.payout.EventNotFinishedException;
import com.eventbooking.exception.payout.NothingToPayOutException;
import com.eventbooking.exception.payout.PayoutAlreadyDecidedException;
import com.eventbooking.exception.payout.PayoutAlreadyRequestedException;
import com.eventbooking.exception.payout.PayoutRequestNotFoundException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.model.PayoutRequest;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.PayoutRequestRepository;
import com.eventbooking.repository.TicketRepository;
import com.eventbooking.service.notification.NotificationEvents;
import com.eventbooking.service.payout.PayoutService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The settlement arithmetic, and the state machine around it.
 *
 * <p><b>What "gross" means.</b> Settled receipts, and only those: a booking
 * counts once it is CONFIRMED and not before. Everything else on an event -
 * expired holds, cancellations, abandoned checkouts - is money that never
 * arrived, and an invoice that counted it would promise the organiser a figure
 * the platform is not holding.
 *
 * <p>Refunds are deliberately not modelled here. Nothing in this product
 * refunds a booking, so there is no column and no deduction for one; if that
 * changes, the fee base is the thing to revisit first, because a commission on
 * money handed back to a customer bills the organiser for a sale that did not
 * happen.
 *
 * <p>Integer arithmetic throughout, and the division floors - so a fraction of
 * a cent goes to the organiser rather than to the platform, which is the
 * direction to round when it is somebody else's money.
 */
@Service
public class PayoutServiceimpl implements PayoutService {

    /**
     * Money the platform is actually holding for this event.
     *
     * <p>One state, and it is the same one {@code PlatformStatsResponse} and
     * the organiser's revenue chart already treat as real income - so the
     * figure on an invoice agrees with the figure on the dashboard that led
     * the organiser to expect it.
     */
    private static final Set<BookingStatus> GROSS_STATES =
            EnumSet.of(BookingStatus.CONFIRMED);

    private final PayoutRequestRepository payoutRequestRepository;
    private final EventRepository eventRepository;
    private final BookingRepository bookingRepository;
    private final TicketRepository ticketRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final AppUserRepository appUserRepository;
    private final PayoutProperties properties;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public PayoutServiceimpl(PayoutRequestRepository payoutRequestRepository,
                             EventRepository eventRepository,
                             BookingRepository bookingRepository,
                             TicketRepository ticketRepository,
                             OrganizerProfileRepository organizerProfileRepository,
                             AppUserRepository appUserRepository,
                             PayoutProperties properties,
                             ApplicationEventPublisher events,
                             Clock clock) {
        this.payoutRequestRepository = payoutRequestRepository;
        this.eventRepository = eventRepository;
        this.bookingRepository = bookingRepository;
        this.ticketRepository = ticketRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.appUserRepository = appUserRepository;
        this.properties = properties;
        this.events = events;
        this.clock = clock;
    }

    // ------------------------------------------------------------ arithmetic

    /**
     * One event's live totals. The quote on the "request a payout" screen, and
     * the snapshot that gets frozen into an invoice - the same method both
     * times, so the number the organiser agreed to and the number they are paid
     * cannot be computed differently.
     */
    private Totals totalsFor(Long eventId) {
        long gross = bookingRepository.sumRevenueForEvent(eventId, GROSS_STATES);
        int feeBps = properties.feeBps();

        // Integer throughout. A double would be exact for 10% and not for 2.5%,
        // and the error only shows up on the invoices large enough for somebody
        // to check the arithmetic by hand. Flooring puts the sub-cent remainder
        // on the organiser's side of the line.
        long fee = gross * feeBps / 10_000L;

        return new Totals(
                gross,
                feeBps,
                fee,
                gross - fee,
                (int) ticketRepository.countByEventIdAndBookingStateIn(eventId, GROSS_STATES),
                (int) bookingRepository.countByEvent_IdAndStateIn(eventId, GROSS_STATES));
    }

    private record Totals(long gross,
                          int feeBps,
                          long fee,
                          long net,
                          int tickets,
                          int bookings) {
    }

    // ------------------------------------------------------------- organiser

    @Override
    @Transactional(readOnly = true)
    public List<PayableEventResponse> payable(Long organizerId) {
        // Everything already spoken for, in one query rather than one per card.
        Set<Long> claimed = new HashSet<>(payoutRequestRepository.findClaimedEventIds(organizerId));

        return eventRepository.findFinishedForOrganizer(organizerId, Instant.now(clock)).stream()
                .filter(event -> !claimed.contains(event.getId()))
                .map(event -> {
                    Totals t = totalsFor(event.getId());
                    return new PayableEventResponse(
                            event.getId(),
                            event.getTitleEn(),
                            event.getTitleKm(),
                            event.getStartsAt(),
                            t.gross(), t.feeBps(), t.fee(), t.net(),
                            t.tickets(), t.bookings());
                })
                // An event that finished owing nothing is not offered, because
                // the only thing clicking it could do is fail.
                .filter(row -> row.netUsdCents() > 0)
                .toList();
    }

    @Override
    @Transactional
    public PayoutRequestResponse request(Long organizerId, CreatePayoutRequest request) {
        Event event = eventRepository.findById(request.eventId())
                .orElseThrow(() -> new EventNotFoundException(request.eventId()));

        // Ownership, before anything else says whether the event is claimable:
        // answering "that event has no revenue" about somebody else's event is
        // a revenue disclosure, however small.
        if (!organizerId.equals(event.getOrganizerId())) {
            throw new EventNotFoundException(request.eventId());
        }

        if (event.getStartsAt() == null || !event.getStartsAt().isBefore(Instant.now(clock))) {
            throw new EventNotFinishedException(event.getId(), event.getStartsAt());
        }

        // Checked here as well as by uq_payout_request_event, so a second
        // click reads as a conflict rather than as a 23505 and a 500. The index
        // is still the authority - two simultaneous requests can both pass this
        // check, and only one of them will commit.
        payoutRequestRepository
                .findFirstByEventId(event.getId())
                .ifPresent(existing -> {
                    throw new PayoutAlreadyRequestedException(event.getId(), existing.getStatus());
                });

        Totals t = totalsFor(event.getId());

        if (t.net() <= 0) {
            throw new NothingToPayOutException(event.getId());
        }

        PayoutRequest payout = PayoutRequest.builder()
                .eventId(event.getId())
                .organizerId(organizerId)
                .invoiceNo(nextInvoiceNo())
                .grossUsdCents(t.gross())
                .feeBps(t.feeBps())
                .feeUsdCents(t.fee())
                .netUsdCents(t.net())
                .ticketsSold(t.tickets())
                .bookingsCount(t.bookings())
                .payoutMethod(request.payoutMethod())
                .accountName(request.accountName().trim())
                .accountNumber(request.accountNumber().trim())
                .note(blankToNull(request.note()))
                .status(PayoutStatus.REQUESTED)
                .build();

        payoutRequestRepository.save(payout);

        // Published, not sent. The listener runs AFTER_COMMIT, so nobody is
        // told the platform owes them money until the row saying so is durable.
        events.publishEvent(new NotificationEvents.PayoutRequested(payout.getId()));

        return toResponse(payout, event, true);
    }

    /**
     * {@code INV-2026-00042}. The year is cosmetic - the sequence never resets,
     * so uniqueness comes from the counter alone and a request made a second
     * after midnight on New Year cannot collide with one made a second before.
     */
    private String nextInvoiceNo() {
        long seq = payoutRequestRepository.nextInvoiceSequence();
        int year = Instant.now(clock).atZone(ZoneOffset.UTC).getYear();
        return String.format("INV-%d-%05d", year, seq);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PayoutRequestResponse> listForOrganizer(Long organizerId, PayoutStatus status) {
        List<PayoutRequest> rows = status == null
                ? payoutRequestRepository.findByOrganizerIdOrderByRequestedAtDesc(organizerId)
                : payoutRequestRepository.findByOrganizerIdAndStatusOrderByRequestedAtDesc(organizerId, status);
        // The organiser owns every row here, so the account number is their own
        // to read back.
        return rows.stream().map(row -> toResponse(row, null, true)).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PayoutRequestResponse getForOrganizer(Long organizerId, Long payoutId) {
        PayoutRequest payout = payoutRequestRepository.findById(payoutId)
                .filter(row -> organizerId.equals(row.getOrganizerId()))
                // Filtered, not branched into a 403. Distinguishing "not yours"
                // from "does not exist" turns a sequential invoice number into
                // an oracle for how much other organisers have been paid.
                .orElseThrow(() -> new PayoutRequestNotFoundException(payoutId));
        return toResponse(payout, null, true);
    }

    // ----------------------------------------------------------------- admin

    @Override
    @Transactional(readOnly = true)
    public List<PayoutRequestResponse> queue(PayoutStatus status) {
        return payoutRequestRepository.findByStatusOrderByRequestedAtAsc(status).stream()
                .map(row -> toResponse(row, null, false))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<PayoutStatus, Long> countsByStatus() {
        Map<PayoutStatus, Long> counts = new EnumMap<>(PayoutStatus.class);
        // Every status present, including the empty ones: a tab whose count is
        // missing renders blank, which reads as "loading" rather than as "none".
        for (PayoutStatus status : PayoutStatus.values()) counts.put(status, 0L);
        for (Object[] row : payoutRequestRepository.countByStatus()) {
            counts.put((PayoutStatus) row[0], (Long) row[1]);
        }
        return counts;
    }

    @Override
    @Transactional(readOnly = true)
    public PayoutRequestResponse getForAdmin(Long payoutId) {
        // Unmasked, unlike the queue above. This is the endpoint the admin
        // opens to actually make the transfer, and an account number they
        // cannot read is an account they cannot pay. The masking in the list
        // view is about how many accounts are on screen at once, not about
        // withholding them from admins.
        return toResponse(require(payoutId), null, true);
    }

    @Override
    @Transactional
    public PayoutRequestResponse approve(Long adminUserId, Long payoutId) {
        PayoutRequest payout = requireIn(payoutId, PayoutStatus.REQUESTED);

        payout.setStatus(PayoutStatus.APPROVED);
        // Not optional garnish: payout_request_review_consistent refuses any
        // non-REQUESTED row that leaves these null.
        payout.setReviewedBy(adminUserId);
        payout.setReviewedAt(Instant.now(clock));
        payoutRequestRepository.save(payout);

        events.publishEvent(new NotificationEvents.PayoutDecided(payout.getId(), PayoutStatus.APPROVED));
        return toResponse(payout, null, false);
    }

    @Override
    @Transactional
    public PayoutRequestResponse markPaid(Long adminUserId, Long payoutId, String reference, String note) {
        // From APPROVED only. Allowing REQUESTED here as a shortcut would erase
        // the one control the two-state split exists to provide: that somebody
        // agreed the debt before somebody transferred against it.
        PayoutRequest payout = requireIn(payoutId, PayoutStatus.APPROVED);

        payout.setStatus(PayoutStatus.PAID);
        payout.setPaidReference(reference.trim());
        payout.setPaidAt(Instant.now(clock));
        // reviewedBy already names whoever approved it. Overwriting it with the
        // person who pressed "paid" would lose the approver, which is the half
        // of the audit trail that matters - anyone can type a reference, but
        // somebody had to agree to the amount.
        if (note != null && !note.isBlank()) {
            payout.setAdminNote(note.trim());
        }
        payoutRequestRepository.save(payout);

        events.publishEvent(new NotificationEvents.PayoutDecided(payout.getId(), PayoutStatus.PAID));
        return toResponse(payout, null, false);
    }

    // ------------------------------------------------------------- internals

    private PayoutRequest require(Long payoutId) {
        return payoutRequestRepository.findById(payoutId)
                .orElseThrow(() -> new PayoutRequestNotFoundException(payoutId));
    }

    private PayoutRequest requireIn(Long payoutId, PayoutStatus expected) {
        PayoutRequest payout = require(payoutId);
        if (payout.getStatus() != expected) {
            throw new PayoutAlreadyDecidedException(payoutId, payout.getStatus(), expected);
        }
        return payout;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * Last four digits, for every reader but the payee.
     *
     * <p>The admin queue renders a screenful of these at a time, and an admin
     * about to make a transfer needs to recognise the account rather than to
     * read it out - they see the whole number on the one row they open. Masking
     * the list is what keeps a bank account out of every screenshot of this
     * screen.
     */
    private static String mask(String accountNumber) {
        if (accountNumber == null) return null;
        String digits = accountNumber.trim();
        if (digits.length() <= 4) return "••••";
        return "•••• " + digits.substring(digits.length() - 4);
    }

    /**
     * @param event    already loaded by the caller, or null to fetch it. The
     *                 request path has it in hand; the list paths do not and
     *                 would otherwise pay for a lookup they could batch. Left
     *                 as a per-row findById for now because a payout list is
     *                 tens of rows, not thousands - if the admin queue ever
     *                 pages, this is the N+1 to fix first.
     * @param unmasked whether the reader owns this row. Only the organiser's
     *                 own paths pass true.
     */
    private PayoutRequestResponse toResponse(PayoutRequest payout, Event event, boolean unmasked) {
        Event e = event != null ? event : eventRepository.findById(payout.getEventId()).orElse(null);
        OrganizerProfile profile = organizerProfileRepository.findById(payout.getOrganizerId()).orElse(null);

        String reviewerName = payout.getReviewedBy() == null ? null
                : appUserRepository.findById(payout.getReviewedBy())
                        .map(AppUser::getDisplayName)
                        .orElse(null);

        return new PayoutRequestResponse(
                payout.getId(),
                payout.getInvoiceNo(),
                payout.getEventId(),
                e == null ? null : e.getTitleEn(),
                e == null ? null : e.getTitleKm(),
                e == null ? null : e.getStartsAt(),
                payout.getOrganizerId(),
                profile == null ? null : profile.getOrgNameEn(),
                profile == null ? null : profile.getOrgNameKm(),
                payout.getGrossUsdCents(),
                payout.getFeeBps(),
                payout.getFeeUsdCents(),
                payout.getNetUsdCents(),
                payout.getTicketsSold(),
                payout.getBookingsCount(),
                payout.getPayoutMethod(),
                payout.getAccountName(),
                unmasked ? payout.getAccountNumber() : mask(payout.getAccountNumber()),
                payout.getNote(),
                payout.getStatus(),
                payout.getAdminNote(),
                payout.getReviewedBy(),
                reviewerName,
                payout.getReviewedAt(),
                payout.getPaidReference(),
                payout.getPaidAt(),
                payout.getRequestedAt());
    }
}
