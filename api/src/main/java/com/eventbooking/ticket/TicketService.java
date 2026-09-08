package com.eventbooking.ticket;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.dto.ticket.*;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.Event;
import com.eventbooking.model.Ticket;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.ScanLogRepository;
import com.eventbooking.repository.TicketRepository;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.ticket.error.TicketNotCheckedInException;
import com.eventbooking.ticket.error.TicketNotFoundException;
import com.eventbooking.ticket.error.UnknownOperatorException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.UUID;

/**
 * Issuing tickets, and spending them at the gate (issue #33).
 *
 * <p><b>One ticket per admission unit, not per booking item.</b> The issue is
 * worded "one ticket per booking item", but the schema is explicit and it is
 * right: a seat line is always {@code qty = 1} and yields one ticket, while a
 * zone line with {@code qty = 3} is three people who will arrive separately and
 * needs three independently scannable tickets. Issuing one per line would send
 * a family of four a single QR and put a steward in the position of deciding
 * how many people it admits.
 *
 * <p>Two properties this class exists to guarantee:
 *
 * <ul>
 *   <li><b>Issuance is idempotent.</b> It counts what a line already has and
 *       creates only the shortfall, so confirming twice - or retrying after a
 *       partial failure - never mints a duplicate. {@code UNIQUE
 *       (booking_item_id, unit_seq)} enforces the same thing underneath.</li>
 *   <li><b>A ticket is single-use.</b> Check-in takes a row lock before reading
 *       {@code checked_in_at}, so two turnstiles scanning one code at the same
 *       instant cannot both see it unused. The read-then-write without that
 *       lock is precisely how a ticket gets admitted twice.</li>
 * </ul>
 */
@Service
public class TicketService {

    private static final Logger log = LoggerFactory.getLogger(TicketService.class);

    private final TicketRepository ticketRepository;
    private final BookingRepository bookingRepository;
    private final AppUserRepository appUserRepository;
    private final EventRepository eventRepository;
    private final OrganizerResolver organizerResolver;
    private final GateAuditor auditor;
    private final ScanLogRepository scanLogRepository;
    private final TicketTokenCodec codec;
    private final TicketMapper mapper;
    private final QrRenderer qrRenderer;

    public TicketService(TicketRepository ticketRepository,
                         BookingRepository bookingRepository,
                         AppUserRepository appUserRepository,
                         EventRepository eventRepository,
                         OrganizerResolver organizerResolver,
                         GateAuditor auditor,
                         ScanLogRepository scanLogRepository,
                         TicketTokenCodec codec,
                         TicketMapper mapper,
                         QrRenderer qrRenderer) {
        this.ticketRepository = ticketRepository;
        this.bookingRepository = bookingRepository;
        this.appUserRepository = appUserRepository;
        this.eventRepository = eventRepository;
        this.organizerResolver = organizerResolver;
        this.auditor = auditor;
        this.scanLogRepository = scanLogRepository;
        this.codec = codec;
        this.mapper = mapper;
        this.qrRenderer = qrRenderer;
    }

    // ------------------------------------------------------------------
    // Issuance
    // ------------------------------------------------------------------

    /**
     * Issues everything a confirmed booking is owed.
     *
     * <p>Called by {@code PaymentService} in the same transaction that moves the
     * booking to CONFIRMED, deliberately: a customer whose payment succeeded but
     * whose tickets silently failed has no way to tell, and would turn up at the
     * gate with nothing. Sharing the transaction means either both happened or
     * neither did - and if neither, the payment attempt stays open and the next
     * poll tries again.
     *
     * <p>Requires no lock of its own: the caller is already holding the booking
     * row lock, which is what serialises two confirmations of one booking.
     *
     * @return the tickets created by <em>this</em> call - empty when they had
     *         all been issued already, which is the normal case on a re-run
     */
    @Transactional
    public List<Ticket> issueForBooking(Booking booking) {
        if (booking.getState() != BookingStatus.CONFIRMED) {
            // Not an exception: the state machine is the authority on when a
            // booking is payable, and this is only ever called just after it
            // allowed the CONFIRMED transition.
            log.warn("Refusing to issue tickets for booking {} in state {}",
                    booking.getId(), booking.getState());
            return List.of();
        }

        Instant now = Instant.now();
        List<Ticket> issued = new ArrayList<>();

        for (BookingItem item : booking.getItems()) {
            if (item.getReleasedAt() != null) {
                continue; // The line was released; nobody is getting in on it.
            }

            int already = ticketRepository.countByBookingItemId(item.getId());
            int owed = item.getQty();

            for (int seq = already + 1; seq <= owed; seq++) {
                issued.add(ticketRepository.save(Ticket.builder()
                        .bookingItem(item)
                        .unitSeq(seq)
                        .qrToken(UUID.randomUUID())
                        .issuedAt(now)
                        .build()));
            }
        }

        if (!issued.isEmpty()) {
            log.info("Issued {} ticket(s) for booking {} ({})",
                    issued.size(), booking.getId(), booking.getBookingRef());
        }
        return issued;
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<TicketResponse> listForBooking(Long bookingId, Long actorUserId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException("Booking " + bookingId + " does not exist."));
        if (!booking.getUserId().equals(actorUserId)) {
            throw new BookingNotFoundException("Booking " + bookingId + " does not exist.");
        }

        return ticketRepository.findByBookingId(bookingId).stream()
                .map(mapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public TicketResponse getForUser(Long ticketId, Long actorUserId) {
        return mapper.toResponse(loadOwned(ticketId, actorUserId));
    }

    /**
     * The ticket's QR as an SVG document.
     *
     * <p>Rendered server-side so a client does not have to ship a QR encoder,
     * and so the payload format stays the server's business - it can change
     * version without a frontend release. Clients that would rather draw it
     * themselves already have {@code qrPayload} on the ticket.
     */
    @Transactional(readOnly = true)
    public String renderQrSvg(Long ticketId, Long actorUserId, Integer sizePx) {
        Ticket ticket = loadOwned(ticketId, actorUserId);
        String payload = codec.encode(ticket.getId(), ticket.getQrToken());
        return sizePx == null ? qrRenderer.toSvg(payload) : qrRenderer.toSvg(payload, sizePx);
    }

    // ------------------------------------------------------------------
    // The gate
    // ------------------------------------------------------------------

    /**
     * Validates a scanned code and, if it is good, spends it.
     *
     * <p>Returns an outcome for every ending rather than throwing - see
     * {@link ScanOutcome}. The checks run in the order a steward would want
     * them: is this even ours, is it real, is it for tonight, has it been used.
     * Checking the event before consuming the ticket matters - a valid ticket
     * presented at the wrong gate must still work at the right one.
     *
     * <p>Authorization runs <em>before</em> the payload is even parsed - see
     * {@link #requireGateOperator}. Nobody who cannot work this gate should be
     * able to learn, from the difference between two responses, whether a code
     * they hold is well-formed.
     *
     * @param eventId        the gate's event. Required, and the thing the caller
     *                       is authorized against
     * @param operatorUserId recorded as {@code checked_in_by}
     */
    @Transactional
    public ScanResponse scan(String payload, Long eventId, Long operatorUserId) {
        requireGateOperator(eventId, operatorUserId);

        TicketTokenCodec.Decoded decoded = codec.decode(payload);

        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.MALFORMED) {
            auditor.recordScan(eventId, operatorUserId, payload, ScanOutcome.MALFORMED, null);
            return ScanResponse.refused(ScanOutcome.MALFORMED, "This is not an event ticket.");
        }
        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE) {
            // Worth a warning rather than a debug line: correct shape with a
            // wrong HMAC is not a misread, it is somebody trying. The log row
            // is what makes forty of them visible after the event.
            log.warn("Rejected a ticket with an invalid signature at event {}", eventId);
            auditor.recordScan(eventId, operatorUserId, payload, ScanOutcome.BAD_SIGNATURE, null);
            return ScanResponse.refused(ScanOutcome.BAD_SIGNATURE, "This code has been altered.");
        }

        // The lock is taken here, before any decision is made, so the whole
        // check-and-consume below is atomic against a second scanner.
        Ticket ticket = ticketRepository.findByIdForUpdate(decoded.ticketId()).orElse(null);

        if (ticket == null || !codec.tokenMatches(decoded.qrToken(), ticket.getQrToken())) {
            // Same answer for "no such id" and "wrong token": telling them apart
            // would confirm which ticket ids exist.
            auditor.recordScan(eventId, operatorUserId, payload, ScanOutcome.UNKNOWN_TICKET, null);
            return ScanResponse.refused(ScanOutcome.UNKNOWN_TICKET, "No such ticket.");
        }

        Booking booking = ticket.getBookingItem().getBooking();
        ScanResponse.ScannedTicket scanned = mapper.toScannedTicket(ticket);

        if (booking.getState() != BookingStatus.CONFIRMED) {
            return ScanResponse.refused(ScanOutcome.BOOKING_NOT_CONFIRMED,
                    "This booking is " + booking.getState() + ".", scanned, null,
                    progressOf(booking));
        }
        // Still needed after the ownership check above: an organiser running two
        // events owns both, so "you may work this gate" does not imply "this
        // ticket belongs at it".
        if (!booking.getEvent().getId().equals(eventId)) {
            return ScanResponse.refused(ScanOutcome.WRONG_EVENT,
                    "This ticket is for a different event.", scanned, null,
                    progressOf(booking));
        }
        if (ticket.isCheckedIn()) {
            return ScanResponse.refused(ScanOutcome.ALREADY_CHECKED_IN,
                    "Already checked in.", scanned, ticket.getCheckedInAt(),
                    progressOf(booking));
        }

        ticket.setCheckedInAt(Instant.now());
        ticket.setCheckedInBy(operatorUserId);

        log.info("Ticket {} checked in for booking {} at event {}",
                ticket.getId(), booking.getId(), booking.getEvent().getId());
        auditor.recordScan(eventId, operatorUserId, payload, ScanOutcome.VALID, ticket);

        // Counted after the stamp, so "3 of 4" includes the person standing
        // here. Reading it before would always be one behind and a steward
        // would wave through a party that is already complete.
        return ScanResponse.admitted(scanned, progressOf(booking));
    }

    // ------------------------------------------------------------------
    // The gate, for a whole party
    //
    // A zone line bought for four is four separate codes. Scanning them one at
    // a time works, but it makes a family queue four times, so these two calls
    // let a steward scan any ONE of them and admit the rest.
    //
    // Split into preview and confirm on purpose. The standing objection to a
    // group pass is that it puts a steward in the position of guessing how many
    // people one code admits - so the count is shown first, and the admission is
    // a second, explicit act.
    // ------------------------------------------------------------------

    /**
     * What a booking looks like before anyone is let in. Admits nobody.
     *
     * <p>Read-only, and deliberately takes <b>no</b> row lock: a preview that
     * locked would block the real scans happening at the same gate while a
     * steward reads a screen.
     */
    @Transactional(readOnly = true)
    public GroupPreviewResponse previewGroup(String payload, Long eventId, Long operatorUserId) {
        requireGateOperator(eventId, operatorUserId);

        TicketTokenCodec.Decoded decoded = codec.decode(payload);
        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.MALFORMED) {
            return GroupPreviewResponse.refused(ScanOutcome.MALFORMED, "This is not an event ticket.");
        }
        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE) {
            log.warn("Rejected a group preview with an invalid signature at event {}", eventId);
            return GroupPreviewResponse.refused(ScanOutcome.BAD_SIGNATURE, "This code has been altered.");
        }

        Ticket ticket = ticketRepository.findById(decoded.ticketId()).orElse(null);
        if (ticket == null || !codec.tokenMatches(decoded.qrToken(), ticket.getQrToken())) {
            return GroupPreviewResponse.refused(ScanOutcome.UNKNOWN_TICKET, "No such ticket.");
        }

        Booking booking = ticket.getBookingItem().getBooking();
        ScannedParty party = mapper.toParty(booking);
        List<GroupPreviewResponse.PreviewTicket> rows =
                mapper.toPreviewTickets(ticketRepository.findByBookingId(booking.getId()));

        // The refusals below carry the party and the rows, not just a reason.
        // A steward turning someone away can then say which booking and how
        // many, instead of reading out an enum.
        if (booking.getState() != BookingStatus.CONFIRMED) {
            return GroupPreviewResponse.refused(ScanOutcome.BOOKING_NOT_CONFIRMED,
                    "This booking is " + booking.getState() + ".", party, rows);
        }
        if (!booking.getEvent().getId().equals(eventId)) {
            return GroupPreviewResponse.refused(ScanOutcome.WRONG_EVENT,
                    "This ticket is for a different event.", party, rows);
        }

        return GroupPreviewResponse.of(party, rows);
    }

    /**
     * Admits the named members of a party.
     *
     * <p><b>Takes ids, not a count.</b> A count works only where every ticket is
     * interchangeable, which is true of a zone line and false of a seated one.
     * On a mixed booking "admit 3" took the first three free tickets in seat
     * order, so three people from the standing area could burn two VIP seats -
     * and the failure surfaced an hour later, as a genuine VIP ticket being
     * refused at the door with no way to explain it.
     *
     * <p>Every id is checked against the booking resolved from the signed
     * payload, so naming ids reaches nothing a count could not. An id that is
     * not on this booking, or is already spent, refuses the <em>whole</em> call:
     * a steward who selected three people and silently got two will wave three
     * of them through.
     */
    @Transactional
    public GroupConfirmResponse confirmGroup(String payload, Long eventId,
                                             List<Long> ticketIds, Long operatorUserId) {
        requireGateOperator(eventId, operatorUserId);

        TicketTokenCodec.Decoded decoded = codec.decode(payload);
        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.MALFORMED) {
            return GroupConfirmResponse.refused(ScanOutcome.MALFORMED, "This is not an event ticket.");
        }
        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE) {
            log.warn("Rejected a group scan with an invalid signature at event {}", eventId);
            return GroupConfirmResponse.refused(ScanOutcome.BAD_SIGNATURE, "This code has been altered.");
        }

        // Unlocked, and it establishes nothing about the ticket - it exists only
        // to learn WHICH booking to lock. Everything is re-checked below against
        // the locked copy.
        Long bookingId = ticketRepository.findById(decoded.ticketId())
                .map(t -> t.getBookingItem().getBooking().getId())
                .orElse(null);
        if (bookingId == null) {
            return GroupConfirmResponse.refused(ScanOutcome.UNKNOWN_TICKET, "No such ticket.");
        }

        // The only lock taken, over every row of the booking in a consistent
        // order. Locking the scanned ticket first and the set second is how two
        // gates scanning two codes from one family deadlock.
        List<Ticket> locked = ticketRepository.findAllByBookingIdForUpdate(bookingId);

        Ticket scanned = locked.stream()
                .filter(t -> t.getId().equals(decoded.ticketId()))
                .findFirst().orElse(null);
        if (scanned == null || !codec.tokenMatches(decoded.qrToken(), scanned.getQrToken())) {
            return GroupConfirmResponse.refused(ScanOutcome.UNKNOWN_TICKET, "No such ticket.");
        }

        Booking booking = scanned.getBookingItem().getBooking();
        ScannedParty party = mapper.toParty(booking);
        long total = locked.size();
        long free = locked.stream().filter(t -> !t.isCheckedIn()).count();

        if (booking.getState() != BookingStatus.CONFIRMED) {
            return GroupConfirmResponse.refused(ScanOutcome.BOOKING_NOT_CONFIRMED,
                    "This booking is " + booking.getState() + ".", party, total, free);
        }
        if (!booking.getEvent().getId().equals(eventId)) {
            return GroupConfirmResponse.refused(ScanOutcome.WRONG_EVENT,
                    "This ticket is for a different event.", party, total, free);
        }

        // Resolved against the LOCKED set, so an id belonging to another booking
        // simply is not found - it is never reachable, only refusable.
        Map<Long, Ticket> onThisBooking = locked.stream()
                .collect(Collectors.toMap(Ticket::getId, Function.identity()));

        List<Long> wanted = ticketIds.stream().distinct().toList();
        List<Ticket> chosen = new ArrayList<>(wanted.size());

        for (Long id : wanted) {
            Ticket ticket = onThisBooking.get(id);
            if (ticket == null) {
                auditor.recordGroupConfirm(eventId, operatorUserId, payload,
                        ScanOutcome.TICKET_NOT_IN_PARTY, scanned, "ticket " + id + " is not on this booking");
                return GroupConfirmResponse.notInParty(party,
                        "One of those tickets is not on this booking.", total, free);
            }
            if (ticket.isCheckedIn()) {
                // Named explicitly, so this is not the "already used" of a
                // re-scan - it is a selection that has gone stale, most likely
                // because another door admitted them while this screen was open.
                auditor.recordGroupConfirm(eventId, operatorUserId, payload,
                        ScanOutcome.TICKET_NOT_IN_PARTY, scanned, "ticket " + id + " was already used");
                return GroupConfirmResponse.notInParty(party,
                        "One of those has already been used - rescan to see who is left.",
                        total, free);
            }
            chosen.add(ticket);
        }

        if (chosen.isEmpty()) {
            return GroupConfirmResponse.tooMany(party, total, free);
        }

        Instant now = Instant.now();
        for (Ticket ticket : chosen) {
            ticket.setCheckedInAt(now);
            ticket.setCheckedInBy(operatorUserId);
        }

        log.info("Group scan admitted {} of {} on booking {} ({}) at event {}: {}",
                chosen.size(), total, booking.getId(), booking.getBookingRef(), eventId, wanted);
        auditor.recordGroupConfirm(eventId, operatorUserId, payload, ScanOutcome.VALID, scanned,
                "admitted " + chosen.size() + " of " + total);

        return GroupConfirmResponse.admitted(
                party, mapper.toAdmittedTickets(chosen), total, free - chosen.size());
    }

    // ------------------------------------------------------------------
    // What happened at the door
    // ------------------------------------------------------------------

    /**
     * Everyone admitted at this event, most recent first.
     *
     * <p>Organiser-only, through the same gate check as a scan: a guest list is
     * exactly as sensitive as the door it belongs to.
     */
    @Transactional(readOnly = true)
    public Page<TicketResponse> checkInsForEvent(Long eventId, Long operatorUserId, Pageable pageable) {
        requireGateOperator(eventId, operatorUserId);
        return ticketRepository.findCheckedInByEventId(eventId, pageable).map(mapper::toResponse);
    }

    /**
     * Admission progress, plus the number nobody else is counting.
     *
     * <p>{@code refusedScans} comes from {@code scan_log} and is the reason that
     * table exists - refusals touch no ticket row, so a night of forged codes is
     * invisible from the ticket table alone.
     */
    @Transactional(readOnly = true)
    public CheckInStatsResponse checkInStats(Long eventId, Long operatorUserId) {
        requireGateOperator(eventId, operatorUserId);
        return CheckInStatsResponse.of(
                eventId,
                ticketRepository.countByEventId(eventId),
                ticketRepository.countCheckedInByEventId(eventId),
                scanLogRepository.countByEventIdAndOutcomeNot(eventId, ScanOutcome.VALID.name()));
    }

    // ------------------------------------------------------------------
    // Putting one back
    // ------------------------------------------------------------------

    /**
     * Reverses a check-in.
     *
     * <p>A steward scans the wrong person, or a party is admitted on the wrong
     * booking. Until this existed the only remedy was a database console, which
     * in practice meant the mistake stayed.
     *
     * <p><b>Always audited, and the audit is not optional.</b> This is the one
     * gate action that hands an admission back, so it is the one most worth a
     * name against it. {@code reason} is required for the same purpose - an
     * undo with no stated cause is indistinguishable from an abuse of it.
     *
     * <p>Takes the same row lock as a scan: an undo racing a second scan of the
     * same ticket must not let both win.
     *
     * @return the ticket as it now stands, un-checked-in
     */
    @Transactional
    public TicketResponse undoCheckIn(Long ticketId, Long eventId, String reason, Long operatorUserId) {
        requireGateOperator(eventId, operatorUserId);

        Ticket ticket = ticketRepository.findByIdForUpdate(ticketId)
                .orElseThrow(() -> new TicketNotFoundException(ticketId));

        Booking booking = ticket.getBookingItem().getBooking();
        // Checked even though the operator owns the gate: owning event 5 is no
        // licence to reverse admissions at event 9.
        if (!booking.getEvent().getId().equals(eventId)) {
            throw new TicketNotFoundException(ticketId);
        }
        if (!ticket.isCheckedIn()) {
            throw new TicketNotCheckedInException(ticketId);
        }

        Long previousOperator = ticket.getCheckedInBy();
        ticket.setCheckedInAt(null);
        ticket.setCheckedInBy(null);

        log.info("Check-in on ticket {} reversed by user {} (was admitted by {}): {}",
                ticketId, operatorUserId, previousOperator, reason);
        auditor.recordUndo(eventId, operatorUserId, ticket, reason);

        return mapper.toResponse(ticket);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /**
     * "May you work this gate?" - asked once, before anything about the ticket
     * is considered.
     *
     * <p>Three separate questions, in the order that fails cheapest:
     *
     * <ol>
     *   <li><b>Are you a real user?</b> Left unchecked this surfaces as a 500
     *       from {@code ticket_checked_in_by_fkey} at the point of stamping -
     *       a valid ticket failing at the gate because the scanner is
     *       misconfigured, which is the worst possible place to fail.</li>
     *   <li><b>Are you an organiser?</b> Having an {@code organizer_profile}
     *       row is what that consists of; {@code AppUser.role} is never read,
     *       so the check cannot drift from the table that holds ownership.</li>
     *   <li><b>Is this event yours?</b> Without it, any organiser could burn
     *       any other organiser's tickets.</li>
     * </ol>
     *
     * <p>All three throw rather than returning a {@link ScanOutcome}. An
     * outcome answers "is this ticket good?", and none of these say anything
     * about the ticket - a steward shown "invalid ticket" because their own
     * account is wrong will turn away a paying customer.
     *
     * <p>Note this runs before {@code codec.decode}. An unauthorized caller
     * gets the same 403 for a genuine ticket, a forged one and a shop barcode,
     * so the endpoint cannot be used as an offline oracle for whether a code
     * is well-formed.
     */
    private void requireGateOperator(Long eventId, Long operatorUserId) {
        if (operatorUserId == null || !appUserRepository.existsById(operatorUserId)) {
            throw new UnknownOperatorException(operatorUserId);
        }

        // Enforced as @NotNull on ScanTicketRequest, so a null here is a coding
        // error rather than a bad request - and one worth failing loudly on,
        // because the version of this method that tolerated null is exactly how
        // a gate came to admit every event's tickets.
        Objects.requireNonNull(eventId, "eventId is required: the gate must name its event");

        Long organizerId = organizerResolver.requireOrganizerId(operatorUserId);
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        organizerResolver.requireOwner(organizerId, event.getOrganizerId(), "event", eventId);
    }

    /**
     * "Is anyone else on this booking still outside?"
     *
     * <p>Two indexed counts rather than loading the booking's tickets: a scan
     * runs while a queue waits, and the gate needs the number, not the rows.
     */
    private ScanResponse.BookingProgress progressOf(Booking booking) {
        return ScanResponse.BookingProgress.of(
                ticketRepository.countByBookingId(booking.getId()),
                ticketRepository.countCheckedInByBookingId(booking.getId()));
    }

    private Ticket loadOwned(Long ticketId, Long actorUserId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new TicketNotFoundException(ticketId));

        if (!ticket.getBookingItem().getBooking().getUserId().equals(actorUserId)) {
            throw new TicketNotFoundException(ticketId);
        }
        return ticket;
    }
}
