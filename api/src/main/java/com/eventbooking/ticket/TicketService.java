package com.eventbooking.ticket;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.dto.ticket.TicketResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.Ticket;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.TicketRepository;
import com.eventbooking.ticket.error.TicketNotFoundException;
import com.eventbooking.ticket.error.UnknownOperatorException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
    private final TicketTokenCodec codec;
    private final TicketMapper mapper;
    private final QrRenderer qrRenderer;

    public TicketService(TicketRepository ticketRepository,
                         BookingRepository bookingRepository,
                         AppUserRepository appUserRepository,
                         TicketTokenCodec codec,
                         TicketMapper mapper,
                         QrRenderer qrRenderer) {
        this.ticketRepository = ticketRepository;
        this.bookingRepository = bookingRepository;
        this.appUserRepository = appUserRepository;
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
     * @param eventId        the gate's event; skipping it admits any event's ticket
     * @param operatorUserId recorded as {@code checked_in_by}
     */
    @Transactional
    public ScanResponse scan(String payload, Long eventId, Long operatorUserId) {
        // Checked up front, and as an exception rather than an outcome: it says
        // nothing about the ticket. Left unchecked it surfaces as a 500 from
        // ticket_checked_in_by_fkey at the point of stamping - i.e. a valid
        // ticket failing at the gate because the scanner is misconfigured.
        if (operatorUserId == null || !appUserRepository.existsById(operatorUserId)) {
            throw new UnknownOperatorException(operatorUserId);
        }

        TicketTokenCodec.Decoded decoded = codec.decode(payload);

        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.MALFORMED) {
            return ScanResponse.refused(ScanOutcome.MALFORMED, "This is not an event ticket.");
        }
        if (decoded.outcome() == TicketTokenCodec.Decoded.Outcome.BAD_SIGNATURE) {
            // Worth a warning rather than a debug line: correct shape with a
            // wrong HMAC is not a misread, it is somebody trying.
            log.warn("Rejected a ticket with an invalid signature at event {}", eventId);
            return ScanResponse.refused(ScanOutcome.BAD_SIGNATURE, "This code has been altered.");
        }

        // The lock is taken here, before any decision is made, so the whole
        // check-and-consume below is atomic against a second scanner.
        Ticket ticket = ticketRepository.findByIdForUpdate(decoded.ticketId()).orElse(null);

        if (ticket == null || !codec.tokenMatches(decoded.qrToken(), ticket.getQrToken())) {
            // Same answer for "no such id" and "wrong token": telling them apart
            // would confirm which ticket ids exist.
            return ScanResponse.refused(ScanOutcome.UNKNOWN_TICKET, "No such ticket.");
        }

        Booking booking = ticket.getBookingItem().getBooking();
        ScanResponse.ScannedTicket scanned = mapper.toScannedTicket(ticket);

        if (booking.getState() != BookingStatus.CONFIRMED) {
            return ScanResponse.refused(ScanOutcome.BOOKING_NOT_CONFIRMED,
                    "This booking is " + booking.getState() + ".", scanned, null);
        }
        if (eventId != null && !booking.getEvent().getId().equals(eventId)) {
            return ScanResponse.refused(ScanOutcome.WRONG_EVENT,
                    "This ticket is for a different event.", scanned, null);
        }
        if (ticket.isCheckedIn()) {
            return ScanResponse.refused(ScanOutcome.ALREADY_CHECKED_IN,
                    "Already checked in.", scanned, ticket.getCheckedInAt());
        }

        ticket.setCheckedInAt(Instant.now());
        ticket.setCheckedInBy(operatorUserId);

        log.info("Ticket {} checked in for booking {} at event {}",
                ticket.getId(), booking.getId(), booking.getEvent().getId());

        return ScanResponse.admitted(scanned);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private Ticket loadOwned(Long ticketId, Long actorUserId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new TicketNotFoundException(ticketId));

        if (!ticket.getBookingItem().getBooking().getUserId().equals(actorUserId)) {
            throw new TicketNotFoundException(ticketId);
        }
        return ticket;
    }
}
