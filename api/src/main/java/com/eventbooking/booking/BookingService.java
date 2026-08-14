package com.eventbooking.booking;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.booking.error.EmptyHoldException;
import com.eventbooking.dto.booking.BookingResponse;
import com.eventbooking.dto.booking.CheckoutRequest;
import com.eventbooking.inventory.error.HoldExpiredException;
import com.eventbooking.inventory.error.HoldNotActiveException;
import com.eventbooking.inventory.error.HoldNotFoundException;
import com.eventbooking.inventory.error.SeatUnavailableException;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.EventZone;
import com.eventbooking.model.Hold;
import com.eventbooking.model.HoldZoneLine;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.repository.HoldZoneLineRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Checkout and the booking lifecycle (issue #30).
 *
 * Every state write goes through {@link BookingStateMachine}; this class owns
 * the inventory consequences of those writes - moving seats and zone capacity
 * from held to sold on conversion, and handing them back when a booking dies.
 */
@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);

    /**
     * States in which a booking still occupies its inventory. A booking that
     * lingers in one of these past the payment window is swept to EXPIRED.
     */
    private static final List<BookingStatus> UNPAID_STATES =
            List.of(BookingStatus.PENDING_PAYMENT, BookingStatus.AWAITING_CONFIRMATION, BookingStatus.PAYMENT_FAILED);

    private final BookingRepository bookingRepository;
    private final HoldRepository holdRepository;
    private final HoldZoneLineRepository holdZoneLineRepository;
    private final EventSeatRepository eventSeatRepository;
    private final EventZoneRepository eventZoneRepository;
    private final BookingStateMachine stateMachine;
    private final BookingRefGenerator refGenerator;
    private final BookingMapper mapper;
    private final BookingProperties properties;

    public BookingService(BookingRepository bookingRepository,
                          HoldRepository holdRepository,
                          HoldZoneLineRepository holdZoneLineRepository,
                          EventSeatRepository eventSeatRepository,
                          EventZoneRepository eventZoneRepository,
                          BookingStateMachine stateMachine,
                          BookingRefGenerator refGenerator,
                          BookingMapper mapper,
                          BookingProperties properties) {
        this.bookingRepository = bookingRepository;
        this.holdRepository = holdRepository;
        this.holdZoneLineRepository = holdZoneLineRepository;
        this.eventSeatRepository = eventSeatRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.stateMachine = stateMachine;
        this.refGenerator = refGenerator;
        this.mapper = mapper;
        this.properties = properties;
    }

    // ------------------------------------------------------------------
    // Hold -> Booking
    // ------------------------------------------------------------------

    /**
     * Converts an active hold into a PENDING_PAYMENT booking.
     *
     * <p><b>On noRollbackFor:</b> when the hold turns out to have expired
     * while the customer was filling in the checkout form, this method
     * releases the seats and zone capacity it was sitting on and then throws
     * HoldExpiredException so the caller gets a 410. Without the
     * noRollbackFor, Spring would roll that release straight back out and the
     * inventory would stay stranded until a sweeper noticed. The expiry check
     * runs before any booking rows are written, so the only thing this commits
     * on the way out is the release itself.
     *
     * @param actorUserId the authenticated caller; a hold belonging to someone
     *                    else is reported as not found rather than forbidden,
     *                    so hold ids cannot be probed for existence
     */
    @Transactional(noRollbackFor = HoldExpiredException.class)
    public Booking convertHold(CheckoutRequest request, Long actorUserId) {
        Long holdId = request.holdId();

        Hold hold = holdRepository.findByIdForUpdate(holdId)
                .orElseThrow(() -> new HoldNotFoundException(holdId));

        if (!hold.getUser().getId().equals(actorUserId)) {
            throw new HoldNotFoundException(holdId);
        }

        // Idempotent checkout: a double-submitted form, or a client retrying
        // through a dropped response, gets back the booking the first request
        // already made instead of a confusing 409 on a consumed hold.
        var alreadyConverted = bookingRepository.findByHoldId(holdId);
        if (alreadyConverted.isPresent()) {
            log.debug("Hold {} already converted to booking {}; returning it",
                    holdId, alreadyConverted.get().getId());
            return alreadyConverted.get();
        }

        requireActive(hold);

        // Expiry mid-checkout. hold.expires_at is the authority, not
        // hold.status: the sweeper is periodic, so a hold is routinely still
        // flagged ACTIVE for a few seconds after its clock has run out.
        if (!hold.getExpiresAt().isAfter(Instant.now())) {
            releaseExpiredHold(hold);
            throw new HoldExpiredException(holdId);
        }

        List<EventSeat> seats = eventSeatRepository.findByHoldIdForUpdate(holdId);
        List<HoldZoneLine> zoneLines = holdZoneLineRepository.findByHoldId(holdId);

        if (seats.isEmpty() && zoneLines.isEmpty()) {
            throw new EmptyHoldException("Hold " + holdId + " covers no seats or zones.");
        }

        Map<Long, EventZone> lockedZones = lockZonesOf(zoneLines);

        Instant now = Instant.now();
        Booking booking = Booking.builder()
                .bookingRef(refGenerator.generate())
                .event(hold.getEvent())
                .userId(hold.getUser().getId())
                .hold(hold)
                .state(BookingStatus.PENDING_PAYMENT)
                .buyerName(request.buyerName())
                .buyerPhoneE164(request.buyerPhoneE164())
                .buyerEmail(request.buyerEmail())
                .createdAt(now)
                .stateChangedAt(now)
                .build();

        long subtotal = 0L;

        for (EventSeat seat : seats) {
            if (seat.getStatus() != SeatStatus.HELD) {
                // The hold still points at this seat but something else has
                // already claimed it. Refusing the whole checkout is the only
                // safe move - a partial booking would charge for seats the
                // customer is not getting.
                throw new SeatUnavailableException(
                        "Seat " + seat.getId() + " is " + seat.getStatus() + ", not HELD; checkout cannot continue.");
            }

            int unitPrice = seat.getSeatClass().getPriceUsdCents();
            booking.addItem(BookingItem.builder()
                    .eventSeat(seat)
                    .qty(1)
                    .unitPriceUsdCents(unitPrice)
                    .build());
            subtotal += unitPrice;

            seat.setStatus(SeatStatus.SOLD);
            seat.setHoldId(null);
            seat.setHoldExpiresAt(null);
        }

        for (HoldZoneLine line : zoneLines) {
            EventZone zone = lockedZones.get(line.getEventZone().getId());
            int qty = line.getQty();

            if (zone.getHeldQty() < qty) {
                // Only reachable if something released this hold's capacity
                // out from under us between the hold lock and the zone lock.
                throw new SeatUnavailableException(
                        "Zone " + zone.getId() + " holds only " + zone.getHeldQty() + " of the " + qty + " reserved.");
            }

            int unitPrice = zone.getPriceUsdCents();
            booking.addItem(BookingItem.builder()
                    .eventZone(zone)
                    .qty(qty)
                    .unitPriceUsdCents(unitPrice)
                    .build());
            subtotal += (long) unitPrice * qty;

            zone.setHeldQty(zone.getHeldQty() - qty);
            zone.setSoldQty(zone.getSoldQty() + qty);
        }

        // No fees or discounts yet, so total tracks subtotal. When they land,
        // they belong here - the columns are already separate for that reason.
        BigDecimal fxRate = properties.fxKhrPerUsd();
        booking.setSubtotalUsdCents(subtotal);
        booking.setTotalUsdCents(subtotal);
        booking.setFxRateKhrPerUsd(fxRate);
        booking.setTotalKhr(toKhr(subtotal, fxRate));

        hold.setStatus(HoldStatus.CONSUMED);

        Booking saved = bookingRepository.save(booking);
        stateMachine.recordCreation(saved, actorUserId, "Converted from hold " + holdId);

        log.info("Hold {} converted to booking {} ({}): {} seat line(s), {} zone line(s), {} USD cents",
                holdId, saved.getId(), saved.getBookingRef(), seats.size(), zoneLines.size(), subtotal);

        return saved;
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    /**
     * Moves a booking to {@code target}, refusing the change if that edge is
     * not on the state machine's transition table.
     *
     * <p>A request to move a booking to the state it is already in is
     * accepted as a no-op rather than refused. Payment webhooks are delivered
     * at-least-once, so a duplicate "confirmed" callback is expected traffic,
     * not a conflict - and no history row is written for it, keeping the audit
     * trail one row per actual change.
     */
    @Transactional
    public Booking transition(Long bookingId, BookingStatus target, Long actorUserId, String note) {
        Booking booking = bookingRepository.findByIdForUpdate(bookingId)
                .orElseThrow(() -> new BookingNotFoundException("Booking " + bookingId + " does not exist."));

        if (booking.getState() == target) {
            log.debug("Booking {} is already {}; treating the transition as a no-op", bookingId, target);
            return booking;
        }

        stateMachine.transition(booking, target, actorUserId, note);

        if (stateMachine.isTerminal(target)) {
            releaseBookingInventory(booking);
        }

        return booking;
    }

    /**
     * Expires bookings that have sat unpaid past the payment window and puts
     * their inventory back on sale.
     *
     * <p>Not scheduled here on purpose - nothing in the app enables scheduling
     * yet, and the inventory lane is bringing its own sweeper for holds. Wire
     * this to the same trigger when that lands.
     *
     * @return how many bookings were expired
     */
    @Transactional
    public int expireStaleBookings() {
        Instant cutoff = Instant.now().minusSeconds(properties.paymentWindowMinutes() * 60L);
        List<Booking> stale = bookingRepository.findStaleInStates(UNPAID_STATES, cutoff);

        int expired = 0;
        for (Booking candidate : stale) {
            // Re-read under a row lock: a payment webhook may have confirmed
            // this booking between the sweep query and now, in which case the
            // state machine legitimately refuses to expire it.
            Booking booking = bookingRepository.findByIdForUpdate(candidate.getId()).orElse(null);
            if (booking == null || !stateMachine.canTransition(booking.getState(), BookingStatus.EXPIRED)) {
                continue;
            }
            stateMachine.transition(booking, BookingStatus.EXPIRED, null, "Payment window elapsed");
            releaseBookingInventory(booking);
            expired++;
        }

        if (expired > 0) {
            log.info("Expired {} unpaid booking(s) past the {}-minute payment window",
                    expired, properties.paymentWindowMinutes());
        }
        return expired;
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Booking getForUser(Long bookingId, Long actorUserId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException("Booking " + bookingId + " does not exist."));

        // Same reasoning as holds: someone else's booking is "not found", so
        // ids cannot be walked to discover which ones exist.
        if (!booking.getUserId().equals(actorUserId)) {
            throw new BookingNotFoundException("Booking " + bookingId + " does not exist.");
        }
        return booking;
    }

    // ------------------------------------------------------------------
    // Controller-facing variants
    //
    // The entity-returning methods above are what the rest of the backend
    // uses. These three exist because open-in-view is off: BookingMapper walks
    // items, seat classes and zones, so the mapping has to happen inside the
    // transaction that loaded them, not after a controller gets the entity back.
    // ------------------------------------------------------------------

    /**
     * Checkout, mapped for the wire.
     *
     * <p><b>The noRollbackFor here is not decoration.</b> A self-call does not
     * pass through Spring's proxy, so {@link #convertHold} runs inside
     * <em>this</em> method's transaction and inherits <em>this</em> annotation.
     * Drop it and the expired-hold release documented on convertHold would be
     * rolled back on the way out, stranding the inventory. The two must stay in
     * step.
     */
    @Transactional(noRollbackFor = HoldExpiredException.class)
    public BookingResponse checkout(CheckoutRequest request, Long actorUserId) {
        return mapper.toResponse(convertHold(request, actorUserId));
    }

    @Transactional(readOnly = true)
    public BookingResponse getResponseForUser(Long bookingId, Long actorUserId) {
        return mapper.toResponse(getForUser(bookingId, actorUserId));
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> listForUser(Long actorUserId, int page, int size) {
        return bookingRepository
                .findByUserIdOrderByCreatedAtDesc(actorUserId, PageRequest.of(page, size))
                .map(mapper::toResponse)
                .getContent();
    }

    @Transactional(readOnly = true)
    public Booking getByRef(String bookingRef) {
        return bookingRepository.findByBookingRef(bookingRef)
                .orElseThrow(() -> new BookingNotFoundException("No booking with reference " + bookingRef + "."));
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private void requireActive(Hold hold) {
        switch (hold.getStatus()) {
            case ACTIVE -> {
                // carry on
            }
            case EXPIRED -> throw new HoldExpiredException(hold.getId());
            case CONSUMED ->
                // findByHoldId found nothing, so the hold was consumed without
                // producing a booking. That should be impossible - both writes
                // happen in one transaction - so it means someone is writing
                // hold.status outside this service.
                    throw new HoldNotActiveException(
                            "Hold " + hold.getId() + " is already consumed.");
            case RELEASED -> throw new HoldNotActiveException(
                    "Hold " + hold.getId() + " was released; start a new one.");
        }
    }

    /**
     * Hands back everything an expired hold was sitting on. Mirrors what the
     * inventory lane's sweeper does; move this there once SeatHoldService and
     * ZoneHoldService exist, so hold release lives in exactly one place.
     */
    private void releaseExpiredHold(Hold hold) {
        List<EventSeat> seats = eventSeatRepository.findByHoldIdForUpdate(hold.getId());
        for (EventSeat seat : seats) {
            if (seat.getStatus() == SeatStatus.HELD) {
                seat.setStatus(SeatStatus.AVAILABLE);
            }
            seat.setHoldId(null);
            seat.setHoldExpiresAt(null);
        }

        List<HoldZoneLine> zoneLines = holdZoneLineRepository.findByHoldId(hold.getId());
        Map<Long, EventZone> lockedZones = lockZonesOf(zoneLines);
        for (HoldZoneLine line : zoneLines) {
            EventZone zone = lockedZones.get(line.getEventZone().getId());
            zone.setHeldQty(Math.max(0, zone.getHeldQty() - line.getQty()));
        }

        hold.setStatus(HoldStatus.EXPIRED);

        log.info("Released expired hold {}: {} seat(s), {} zone line(s)",
                hold.getId(), seats.size(), zoneLines.size());
    }

    /**
     * Returns a dead booking's inventory to the pool and closes its lines.
     *
     * <p>Stamping releasedAt is what frees the seat for resale: the line is
     * kept as financial history, and uq_booking_item_seat_live only counts
     * lines that have not been released (see V2__booking_item_release.sql).
     */
    private void releaseBookingInventory(Booking booking) {
        Instant now = Instant.now();

        List<BookingItem> liveItems = booking.getItems().stream()
                .filter(item -> item.getReleasedAt() == null)
                .toList();
        if (liveItems.isEmpty()) {
            return;
        }

        List<Long> zoneIds = liveItems.stream()
                .filter(item -> item.getEventZone() != null)
                .map(item -> item.getEventZone().getId())
                .distinct()
                .sorted()
                .toList();
        Map<Long, EventZone> lockedZones = zoneIds.isEmpty()
                ? Map.of()
                : eventZoneRepository.findAllByIdForUpdate(zoneIds).stream()
                        .collect(Collectors.toMap(EventZone::getId, Function.identity()));

        for (BookingItem item : liveItems) {
            if (item.getEventSeat() != null) {
                EventSeat seat = item.getEventSeat();
                if (seat.getStatus() == SeatStatus.SOLD) {
                    seat.setStatus(SeatStatus.AVAILABLE);
                }
            } else {
                EventZone zone = lockedZones.get(item.getEventZone().getId());
                zone.setSoldQty(Math.max(0, zone.getSoldQty() - item.getQty()));
            }
            item.setReleasedAt(now);
        }

        log.info("Booking {} reached {}; released {} line(s) back to inventory",
                booking.getId(), booking.getState(), liveItems.size());
    }

    /**
     * Row-locks every zone the given lines touch, in id order so concurrent
     * checkouts over an overlapping set queue instead of deadlocking.
     */
    private Map<Long, EventZone> lockZonesOf(List<HoldZoneLine> zoneLines) {
        if (zoneLines.isEmpty()) {
            return Map.of();
        }
        // Reading the id off the lazy proxy costs no query, so the zones are
        // first materialised by the locking select below rather than before it.
        List<Long> zoneIds = zoneLines.stream()
                .map(line -> line.getEventZone().getId())
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();

        Map<Long, EventZone> byId = new HashMap<>();
        for (EventZone zone : eventZoneRepository.findAllByIdForUpdate(zoneIds)) {
            byId.put(zone.getId(), zone);
        }
        return byId;
    }

    /** USD cents -> whole riel at the booking's snapshotted rate. */
    private long toKhr(long usdCents, BigDecimal khrPerUsd) {
        return BigDecimal.valueOf(usdCents)
                .movePointLeft(2)
                .multiply(khrPerUsd)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }
}
