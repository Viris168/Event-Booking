package com.eventbooking.ticket;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.InventoryMode;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.dto.ticket.GroupConfirmResponse;
import com.eventbooking.dto.ticket.GroupPreviewResponse;
import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.EventZone;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.VenueSeat;
import com.eventbooking.model.Ticket;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.ScanLogRepository;
import com.eventbooking.repository.TicketRepository;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.security.error.NotAnOrganizerException;
import com.eventbooking.security.error.NotResourceOwnerException;
import com.eventbooking.ticket.error.TicketNotFoundException;
import com.eventbooking.ticket.error.UnknownOperatorException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Issuance and the gate, without a database.
 *
 * <p>The codec and mapper are real: the scan tests are meaningless if the thing
 * being scanned is not a genuinely signed payload.
 */
class TicketServiceTest {

    private static final Long USER_ID = 7L;
    private static final Long OPERATOR_ID = 99L;
    private static final Long BOOKING_ID = 42L;
    private static final Long EVENT_ID = 5L;
    private static final Long ORGANIZER_ID = 77L;
    /** Another organiser's account - a real user, a real organiser, wrong gate. */
    private static final Long RIVAL_OPERATOR_ID = 88L;
    private static final Long RIVAL_ORGANIZER_ID = 66L;
    private static final String SECRET = "test-secret-that-is-long-enough-to-pass-32";

    private TicketRepository ticketRepository;
    private BookingRepository bookingRepository;
    private AppUserRepository appUserRepository;
    private EventRepository eventRepository;
    private OrganizerProfileRepository organizerProfileRepository;
    private ScanLogRepository scanLogRepository;
    private TicketTokenCodec codec;
    private TicketService service;
    private AtomicLong nextTicketId;

    @BeforeEach
    void setUp() {
        ticketRepository = mock(TicketRepository.class);
        bookingRepository = mock(BookingRepository.class);
        appUserRepository = mock(AppUserRepository.class);
        when(appUserRepository.existsById(OPERATOR_ID)).thenReturn(true);
        when(appUserRepository.existsById(100L)).thenReturn(true);
        when(appUserRepository.existsById(RIVAL_OPERATOR_ID)).thenReturn(true);

        // The gate operator owns EVENT_ID; the rival is an organiser of nothing
        // that matters here. Both are real users, which is the point - the old
        // check could not tell them apart.
        organizerProfileRepository = mock(OrganizerProfileRepository.class);
        givenOrganizer(OPERATOR_ID, ORGANIZER_ID);
        givenOrganizer(100L, ORGANIZER_ID);
        givenOrganizer(RIVAL_OPERATOR_ID, RIVAL_ORGANIZER_ID);

        eventRepository = mock(EventRepository.class);
        when(eventRepository.findById(EVENT_ID))
                .thenReturn(Optional.of(eventOwnedBy(ORGANIZER_ID)));

        TicketProperties properties = new TicketProperties(SECRET, 256, 4);
        codec = new TicketTokenCodec(properties);
        // A real auditor over a mock repository: the gate must keep working when
        // the trail cannot be written, and that is only true if it is exercised.
        scanLogRepository = mock(ScanLogRepository.class);

        service = new TicketService(
                ticketRepository, bookingRepository, appUserRepository,
                eventRepository, new OrganizerResolver(organizerProfileRepository),
                new GateAuditor(scanLogRepository), scanLogRepository, codec,
                new TicketMapper(codec), new QrRenderer(properties));

        nextTicketId = new AtomicLong(1);
        when(ticketRepository.save(any(Ticket.class))).thenAnswer(invocation -> {
            Ticket ticket = invocation.getArgument(0);
            ticket.setId(nextTicketId.getAndIncrement());
            return ticket;
        });
    }

    // ------------------------------------------------------------------
    // Issuance
    // ------------------------------------------------------------------

    @Test
    void issuesOneTicketPerAdmissionUnitNotPerLine() {
        // Three people bought standing room together. They will arrive
        // separately, so one QR between them is useless.
        Booking booking = confirmedBookingWithZoneLine(3);

        List<Ticket> issued = service.issueForBooking(booking);

        assertThat(issued).hasSize(3);
        assertThat(issued).extracting(Ticket::getUnitSeq).containsExactly(1, 2, 3);
    }

    @Test
    void givesEveryTicketItsOwnRandomToken() {
        // Shared tokens would make one scanned ticket reveal its siblings.
        List<Ticket> issued = service.issueForBooking(confirmedBookingWithZoneLine(3));

        assertThat(issued).extracting(Ticket::getQrToken).doesNotHaveDuplicates();
        assertThat(issued).extracting(Ticket::getQrToken).doesNotContainNull();
    }

    @Test
    void issuesASingleTicketForASeat() {
        Booking booking = confirmedBookingWithZoneLine(1);

        assertThat(service.issueForBooking(booking)).hasSize(1);
    }

    @Test
    void issuingTwiceDoesNotDuplicateTickets() {
        // Confirming is idempotent - a replayed payment poll must not post a
        // second set of tickets to the customer.
        Booking booking = confirmedBookingWithZoneLine(3);
        when(ticketRepository.countByBookingItemId(anyLong())).thenReturn(3);

        assertThat(service.issueForBooking(booking)).isEmpty();
    }

    @Test
    void finishesAPartiallyIssuedLine() {
        // A crash between saves leaves a line short; the retry completes it
        // rather than starting again.
        Booking booking = confirmedBookingWithZoneLine(3);
        when(ticketRepository.countByBookingItemId(anyLong())).thenReturn(1);

        List<Ticket> issued = service.issueForBooking(booking);

        assertThat(issued).hasSize(2);
        assertThat(issued).extracting(Ticket::getUnitSeq).containsExactly(2, 3);
    }

    @Test
    void issuesNothingForAReleasedLine() {
        Booking booking = confirmedBookingWithZoneLine(3);
        booking.getItems().getFirst().setReleasedAt(Instant.now());

        assertThat(service.issueForBooking(booking)).isEmpty();
    }

    @Test
    void refusesToIssueForABookingThatIsNotConfirmed() {
        Booking booking = confirmedBookingWithZoneLine(2);
        booking.setState(BookingStatus.PENDING_PAYMENT);

        assertThat(service.issueForBooking(booking)).isEmpty();
    }

    // ------------------------------------------------------------------
    // The gate
    // ------------------------------------------------------------------

    @Test
    void admitsAValidTicketAndStampsIt() {
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        ScanResponse response = service.scan(payloadFor(ticket), EVENT_ID, OPERATOR_ID);

        assertThat(response.admitted()).isTrue();
        assertThat(response.outcome()).isEqualTo(ScanOutcome.VALID);
        assertThat(ticket.getCheckedInAt()).isNotNull();
        assertThat(ticket.getCheckedInBy()).isEqualTo(OPERATOR_ID);
        assertThat(response.ticket().bookingRef()).isEqualTo("KH-TEST01");
    }

    @Test
    void neverEchoesTheQrPayloadBackToTheScanner() {
        // A scanner that could read payloads out of its own responses could
        // harvest working tickets.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        ScanResponse response = service.scan(payloadFor(ticket), EVENT_ID, OPERATOR_ID);

        assertThat(response.toString()).doesNotContain(payloadFor(ticket));
    }

    @Test
    void refusesASecondScanOfTheSameTicket() {
        // The single-use guarantee. The second person handed the same screenshot
        // does not get in.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        service.scan(payloadFor(ticket), EVENT_ID, OPERATOR_ID);
        Instant firstEntry = ticket.getCheckedInAt();

        ScanResponse second = service.scan(payloadFor(ticket), EVENT_ID, 100L);

        assertThat(second.admitted()).isFalse();
        assertThat(second.outcome()).isEqualTo(ScanOutcome.ALREADY_CHECKED_IN);
        assertThat(second.previousCheckInAt()).isEqualTo(firstEntry);
        // The original entry is not overwritten - who came in first is evidence.
        assertThat(ticket.getCheckedInAt()).isEqualTo(firstEntry);
        assertThat(ticket.getCheckedInBy()).isEqualTo(OPERATOR_ID);
    }

    @Test
    void refusesACodeThatIsNotATicket() {
        ScanResponse response = service.scan("4901234567894", EVENT_ID, OPERATOR_ID);

        assertThat(response.admitted()).isFalse();
        assertThat(response.outcome()).isEqualTo(ScanOutcome.MALFORMED);
        assertThat(response.ticket()).isNull();
    }

    @Test
    void refusesAForgedTicket() {
        // Someone else's ticket with the id edited to point at ours.
        Ticket ticket = issuedTicket();
        String[] parts = payloadFor(ticket).split("\\.");
        String forged = parts[0] + ".999." + parts[2] + "." + parts[3];

        ScanResponse response = service.scan(forged, EVENT_ID, OPERATOR_ID);

        assertThat(response.outcome()).isEqualTo(ScanOutcome.BAD_SIGNATURE);
    }

    @Test
    void refusesASignedTicketThatDoesNotExist() {
        when(ticketRepository.findByIdForUpdate(anyLong())).thenReturn(Optional.empty());

        ScanResponse response = service.scan(codec.encode(777L, UUID.randomUUID()), EVENT_ID, OPERATOR_ID);

        assertThat(response.outcome()).isEqualTo(ScanOutcome.UNKNOWN_TICKET);
    }

    @Test
    void refusesTheRightIdWithTheWrongToken() {
        // Answers exactly as for a non-existent ticket, so the response cannot
        // be used to discover which ids are real.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        ScanResponse response = service.scan(
                codec.encode(ticket.getId(), UUID.randomUUID()), EVENT_ID, OPERATOR_ID);

        assertThat(response.outcome()).isEqualTo(ScanOutcome.UNKNOWN_TICKET);
        assertThat(ticket.getCheckedInAt()).isNull();
    }

    @Test
    void refusesATicketForAnotherEventWithoutConsumingIt() {
        // The operator runs two events and is standing at the wrong one, so
        // ownership passes and only the ticket's own event says no. It has to
        // still work at its own gate afterwards.
        when(eventRepository.findById(999L)).thenReturn(Optional.of(eventOwnedBy(ORGANIZER_ID)));
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        ScanResponse response = service.scan(payloadFor(ticket), 999L, OPERATOR_ID);

        assertThat(response.outcome()).isEqualTo(ScanOutcome.WRONG_EVENT);
        assertThat(ticket.getCheckedInAt()).as("a misdirected ticket must not be burned").isNull();
    }

    @Test
    void refusesATicketWhoseBookingWasRefunded() {
        Ticket ticket = issuedTicket();
        ticket.getBookingItem().getBooking().setState(BookingStatus.REFUNDED);
        givenTicketUnderLock(ticket);

        ScanResponse response = service.scan(payloadFor(ticket), EVENT_ID, OPERATOR_ID);

        assertThat(response.outcome()).isEqualTo(ScanOutcome.BOOKING_NOT_CONFIRMED);
        assertThat(ticket.getCheckedInAt()).isNull();
    }

    @Test
    void refusesAScanThatNamesNoEvent() {
        // This used to admit any event's ticket. @NotNull on ScanTicketRequest
        // stops it at the controller; the service refuses too, so the hole
        // cannot come back through a second caller.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        assertThatThrownBy(() -> service.scan(payloadFor(ticket), null, OPERATOR_ID))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("eventId is required");

        assertThat(ticket.getCheckedInAt()).isNull();
    }

    @Test
    void refusesAScanFromAGateThatIsNotARegisteredUser() {
        // An exception, not an outcome: it says nothing about the ticket, and a
        // steward with a misconfigured scanner must not be told "invalid ticket".
        // Left unchecked this is a 500 from the checked_in_by foreign key, fired
        // after the ticket has already been validated.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        assertThatThrownBy(() -> service.scan(payloadFor(ticket), EVENT_ID, 4242L))
                .isInstanceOf(UnknownOperatorException.class);

        assertThat(ticket.getCheckedInAt()).isNull();
    }

    @Test
    void reportsHowMuchOfThePartyIsStillOutside() {
        // The steward scanning the third of a family's four codes has no other
        // way to know anyone else is coming.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);
        when(ticketRepository.countByBookingId(BOOKING_ID)).thenReturn(4L);
        when(ticketRepository.countCheckedInByBookingId(BOOKING_ID)).thenReturn(3L);

        ScanResponse response = service.scan(payloadFor(ticket), EVENT_ID, OPERATOR_ID);

        assertThat(response.admitted()).isTrue();
        assertThat(response.booking().total()).isEqualTo(4);
        assertThat(response.booking().checkedIn()).isEqualTo(3);
        assertThat(response.booking().remaining()).isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Group scan
    //
    // Admission is by ticket id, never by count. On a mixed booking a count
    // takes the first N free tickets in seat order, so three standing-area
    // guests could burn two VIP seats - and the VIP holder is refused an hour
    // later with no way to explain it.
    // ------------------------------------------------------------------

    @Test
    void previewShowsTheWholePartyAndAdmitsNobody() {
        List<Ticket> party = issuedParty(4);
        givenParty(party);

        GroupPreviewResponse preview =
                service.previewGroup(payloadFor(party.getFirst()), EVENT_ID, OPERATOR_ID);

        assertThat(preview.admissible()).isTrue();
        assertThat(preview.total()).isEqualTo(4);
        assertThat(preview.remaining()).isEqualTo(4);
        assertThat(party).allSatisfy(t ->
                assertThat(t.getCheckedInAt()).as("a preview must consume nothing").isNull());
    }

    @Test
    void previewTellsSeatsApartFromZoneAdmissions() {
        // The distinction the whole feature turns on: a client can only offer
        // "admit 3 standing" if it knows which rows are interchangeable.
        List<Ticket> party = mixedParty();
        givenParty(party);

        GroupPreviewResponse preview =
                service.previewGroup(payloadFor(party.getFirst()), EVENT_ID, OPERATOR_ID);

        assertThat(preview.tickets()).filteredOn(GroupPreviewResponse.PreviewTicket::assigned)
                .as("two VIP seats").hasSize(2);
        assertThat(preview.tickets()).filteredOn(t -> !t.assigned())
                .as("three standing").hasSize(3);
        assertThat(preview.tickets()).allSatisfy(t ->
                assertThat(t.bookingItemId()).as("grouping needs the line").isNotNull());
    }

    @Test
    void confirmAdmitsExactlyTheTicketsNamedAndNothingElse() {
        // THE regression test for this design. Three standing guests are
        // admitted; both VIP seats must still be spendable by the people who
        // actually hold them.
        List<Ticket> party = mixedParty();
        givenParty(party);
        List<Long> standing = party.stream()
                .filter(t -> t.getBookingItem().getEventSeat() == null)
                .map(Ticket::getId).toList();

        GroupConfirmResponse result = service.confirmGroup(
                payloadFor(party.getFirst()), EVENT_ID, standing, OPERATOR_ID);

        assertThat(result.admittedCount()).isEqualTo(3);
        assertThat(result.remaining()).isEqualTo(2);
        assertThat(party).filteredOn(t -> t.getBookingItem().getEventSeat() != null)
                .as("the VIP seats were not touched")
                .allSatisfy(t -> assertThat(t.isCheckedIn()).isFalse());
    }

    @Test
    void confirmCanAdmitOneNamedSeatWithoutTheOther() {
        List<Ticket> party = mixedParty();
        givenParty(party);
        Ticket firstSeat = party.stream()
                .filter(t -> t.getBookingItem().getEventSeat() != null).findFirst().orElseThrow();

        GroupConfirmResponse result = service.confirmGroup(
                payloadFor(party.getFirst()), EVENT_ID, List.of(firstSeat.getId()), OPERATOR_ID);

        assertThat(result.admittedCount()).isEqualTo(1);
        assertThat(firstSeat.isCheckedIn()).isTrue();
        assertThat(party).filteredOn(Ticket::isCheckedIn).hasSize(1);
    }

    @Test
    void confirmRefusesTheWholeCallForATicketOnAnotherBooking() {
        List<Ticket> party = issuedParty(3);
        givenParty(party);

        GroupConfirmResponse result = service.confirmGroup(
                payloadFor(party.getFirst()), EVENT_ID,
                List.of(party.getFirst().getId(), 9999L), OPERATOR_ID);

        assertThat(result.admitted()).isFalse();
        assertThat(result.outcome()).isEqualTo(ScanOutcome.TICKET_NOT_IN_PARTY);
        assertThat(party).as("a partial admission is worse than none")
                .noneMatch(Ticket::isCheckedIn);
    }

    @Test
    void confirmRefusesTheWholeCallWhenASelectionHasGoneStale() {
        // Another door admitted someone while this screen was open. Admitting
        // the rest silently would send a steward away believing three went in.
        List<Ticket> party = issuedParty(3);
        party.get(1).setCheckedInAt(Instant.now());
        givenParty(party);

        GroupConfirmResponse result = service.confirmGroup(
                payloadFor(party.getFirst()), EVENT_ID,
                party.stream().map(Ticket::getId).toList(), OPERATOR_ID);

        assertThat(result.outcome()).isEqualTo(ScanOutcome.TICKET_NOT_IN_PARTY);
        assertThat(party).filteredOn(Ticket::isCheckedIn).hasSize(1);
    }

    @Test
    void confirmIgnoresARepeatedIdRatherThanAdmittingTwice() {
        List<Ticket> party = issuedParty(2);
        givenParty(party);
        Long id = party.getFirst().getId();

        GroupConfirmResponse result = service.confirmGroup(
                payloadFor(party.getFirst()), EVENT_ID, List.of(id, id), OPERATOR_ID);

        assertThat(result.admittedCount()).isEqualTo(1);
        assertThat(party).filteredOn(Ticket::isCheckedIn).hasSize(1);
    }

    @Test
    void theLatecomerGetsInOnTheCodeHisFriendsAlreadyUsed() {
        // The party shared one phone. That code is spent, so the single-scan
        // endpoint refuses it - but the group call still admits him, because the
        // scanned code is only the key that finds the booking.
        List<Ticket> party = issuedParty(3);
        givenParty(party);
        String shared = payloadFor(party.getFirst());

        service.confirmGroup(shared, EVENT_ID,
                List.of(party.get(0).getId(), party.get(1).getId()), OPERATOR_ID);

        ScanResponse refused = service.scan(shared, EVENT_ID, OPERATOR_ID);
        assertThat(refused.outcome()).isEqualTo(ScanOutcome.ALREADY_CHECKED_IN);

        GroupConfirmResponse late = service.confirmGroup(
                shared, EVENT_ID, List.of(party.get(2).getId()), OPERATOR_ID);

        assertThat(late.admittedCount()).isEqualTo(1);
        assertThat(late.remaining()).isZero();
        assertThat(party).allMatch(Ticket::isCheckedIn);
    }

    @Test
    void groupCallsRefuseACodeThatIsNotATicket() {
        assertThat(service.previewGroup("4901234567894", EVENT_ID, OPERATOR_ID).outcome())
                .isEqualTo(ScanOutcome.MALFORMED);
        assertThat(service.confirmGroup("4901234567894", EVENT_ID, List.of(1L), OPERATOR_ID).outcome())
                .isEqualTo(ScanOutcome.MALFORMED);
    }

    @Test
    void groupCallsRefuseSomebodyElsesGate() {
        List<Ticket> party = issuedParty(2);
        givenParty(party);
        String payload = payloadFor(party.getFirst());
        List<Long> ids = party.stream().map(Ticket::getId).toList();

        assertThatThrownBy(() -> service.previewGroup(payload, EVENT_ID, RIVAL_OPERATOR_ID))
                .isInstanceOf(NotResourceOwnerException.class);
        assertThatThrownBy(() -> service.confirmGroup(payload, EVENT_ID, ids, RIVAL_OPERATOR_ID))
                .isInstanceOf(NotResourceOwnerException.class);

        assertThat(party).noneMatch(Ticket::isCheckedIn);
    }

    // ------------------------------------------------------------------
    // Gate authorization
    //
    // Before this existed, every one of these scans succeeded: the only check
    // was that the operator's id appeared in app_user, so any customer could
    // burn any stranger's ticket at any event.
    // ------------------------------------------------------------------

    @Test
    void refusesAScanFromSomebodyWhoIsNotAnOrganizer() {
        // A customer holding a valid ticket is a real, registered user. That was
        // once enough to consume somebody else's.
        givenNoOrganizerProfile(USER_ID);
        when(appUserRepository.existsById(USER_ID)).thenReturn(true);
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        assertThatThrownBy(() -> service.scan(payloadFor(ticket), EVENT_ID, USER_ID))
                .isInstanceOf(NotAnOrganizerException.class);

        assertThat(ticket.getCheckedInAt()).as("a refused scan must not consume the ticket").isNull();
    }

    @Test
    void refusesAnOrganizerWorkingSomebodyElsesGate() {
        // The competitor down the road is an organiser in good standing. That
        // says nothing about whether they may stand at this door.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        assertThatThrownBy(() -> service.scan(payloadFor(ticket), EVENT_ID, RIVAL_OPERATOR_ID))
                .isInstanceOf(NotResourceOwnerException.class);

        assertThat(ticket.getCheckedInAt()).isNull();
    }

    @Test
    void refusesAScanAtAnEventThatDoesNotExist() {
        when(eventRepository.findById(1234L)).thenReturn(Optional.empty());
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        assertThatThrownBy(() -> service.scan(payloadFor(ticket), 1234L, OPERATOR_ID))
                .isInstanceOf(EventNotFoundException.class);
    }

    @Test
    void authorizesBeforeItReadsThePayload() {
        // An unauthorized caller gets the same answer for a genuine ticket and
        // for a shop barcode. Otherwise the endpoint is an oracle for whether a
        // code is one of ours - readable by anyone with an account.
        assertThatThrownBy(() -> service.scan("4901234567894", EVENT_ID, RIVAL_OPERATOR_ID))
                .isInstanceOf(NotResourceOwnerException.class);

        assertThatThrownBy(() -> service.scan(payloadFor(issuedTicket()), EVENT_ID, RIVAL_OPERATOR_ID))
                .isInstanceOf(NotResourceOwnerException.class);
    }

    // ------------------------------------------------------------------
    // Ownership
    // ------------------------------------------------------------------

    @Test
    void reportsSomebodyElsesTicketAsNotFound() {
        Ticket ticket = issuedTicket();
        when(ticketRepository.findById(ticket.getId())).thenReturn(Optional.of(ticket));

        assertThatThrownBy(() -> service.getForUser(ticket.getId(), 999L))
                .isInstanceOf(TicketNotFoundException.class);
    }

    @Test
    void reportsSomebodyElsesBookingAsNotFound() {
        Booking booking = confirmedBookingWithZoneLine(1);
        when(bookingRepository.findById(BOOKING_ID)).thenReturn(Optional.of(booking));

        assertThatThrownBy(() -> service.listForBooking(BOOKING_ID, 999L))
                .isInstanceOf(BookingNotFoundException.class);
    }

    @Test
    void rendersTheOwnersQrAsSvg() {
        Ticket ticket = issuedTicket();
        when(ticketRepository.findById(ticket.getId())).thenReturn(Optional.of(ticket));

        String svg = service.renderQrSvg(ticket.getId(), USER_ID, 512);

        assertThat(svg).startsWith("<svg").contains("width=\"512\"").endsWith("</svg>");
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    /** A confirmed zone booking of {@code qty}, already issued. */
    private static List<Ticket> issuedParty(int qty) {
        Booking booking = confirmedBookingWithZoneLine(qty);
        BookingItem item = booking.getItems().getFirst();
        List<Ticket> party = new java.util.ArrayList<>();
        for (int seq = 1; seq <= qty; seq++) {
            party.add(Ticket.builder()
                    .id((long) seq)
                    .bookingItem(item)
                    .unitSeq(seq)
                    .qrToken(UUID.randomUUID())
                    .issuedAt(Instant.now())
                    .build());
        }
        return party;
    }

    /**
     * Every lookup a gate makes over one party - group calls and the
     * single-ticket path both, so a test can mix them the way a real door does.
     */
    /**
     * Two VIP seats and three standing admissions on one booking - the shape a
     * count cannot safely serve.
     */
    private static List<Ticket> mixedParty() {
        Booking booking = confirmedBookingWithZoneLine(3);
        BookingItem zoneLine = booking.getItems().getFirst();

        EventSeat seat = EventSeat.builder()
                .id(21L)
                .seatClass(SeatClass.builder().id(9L).nameEn("VIP").nameKm("VIP").build())
                .venueSeat(VenueSeat.builder()
                        .id(31L).sectionLabel("Main Floor").rowLabel("C").seatNumber("1").build())
                .build();

        List<Ticket> party = new java.util.ArrayList<>();
        long id = 1;
        for (int seq = 1; seq <= 3; seq++) {
            party.add(Ticket.builder().id(id++).bookingItem(zoneLine).unitSeq(seq)
                    .qrToken(UUID.randomUUID()).issuedAt(Instant.now()).build());
        }
        for (int n = 0; n < 2; n++) {
            BookingItem seatLine = BookingItem.builder()
                    .id(50L + n).eventSeat(seat).qty(1).unitPriceUsdCents(5_000).build();
            booking.addItem(seatLine);
            party.add(Ticket.builder().id(id++).bookingItem(seatLine).unitSeq(1)
                    .qrToken(UUID.randomUUID()).issuedAt(Instant.now()).build());
        }
        return party;
    }

    private void givenParty(List<Ticket> party) {
        party.forEach(t -> {
            when(ticketRepository.findById(t.getId())).thenReturn(Optional.of(t));
            when(ticketRepository.findByIdForUpdate(t.getId())).thenReturn(Optional.of(t));
        });
        when(ticketRepository.findAllByBookingIdForUpdate(BOOKING_ID)).thenReturn(party);
        when(ticketRepository.findByBookingId(BOOKING_ID)).thenReturn(party);
        // progressOf() reads these on every single scan.
        when(ticketRepository.countByBookingId(BOOKING_ID))
                .thenAnswer(i -> (long) party.size());
        when(ticketRepository.countCheckedInByBookingId(BOOKING_ID))
                .thenAnswer(i -> party.stream().filter(Ticket::isCheckedIn).count());
    }

    private void givenOrganizer(Long userId, Long organizerId) {
        when(organizerProfileRepository.findByUserId(userId)).thenReturn(
                Optional.of(OrganizerProfile.builder().id(organizerId).userId(userId).build()));
    }

    private void givenNoOrganizerProfile(Long userId) {
        when(organizerProfileRepository.findByUserId(userId)).thenReturn(Optional.empty());
    }

    private static Event eventOwnedBy(Long organizerId) {
        return Event.builder().id(EVENT_ID).organizerId(organizerId).build();
    }

    private void givenTicketUnderLock(Ticket ticket) {
        when(ticketRepository.findByIdForUpdate(ticket.getId())).thenReturn(Optional.of(ticket));
    }

    private String payloadFor(Ticket ticket) {
        return codec.encode(ticket.getId(), ticket.getQrToken());
    }

    private Ticket issuedTicket() {
        Booking booking = confirmedBookingWithZoneLine(3);
        return Ticket.builder()
                .id(1L)
                .bookingItem(booking.getItems().getFirst())
                .unitSeq(1)
                .qrToken(UUID.randomUUID())
                .issuedAt(Instant.now())
                .build();
    }

    private static Booking confirmedBookingWithZoneLine(int qty) {
        Event event = Event.builder()
                .id(EVENT_ID)
                .organizerId(ORGANIZER_ID)
                .inventoryMode(InventoryMode.ZONED)
                .slug("dev-show")
                .titleEn("Dev Show")
                .titleKm("កម្មវិធីសាកល្បង")
                .startsAt(Instant.now().plusSeconds(86_400))
                .build();

        EventZone zone = EventZone.builder()
                .id(3L)
                .event(event)
                .nameEn("GA Floor")
                .nameKm("តំបន់ GA")
                .priceUsdCents(2_500)
                .capacity(500)
                .build();

        Booking booking = Booking.builder()
                .id(BOOKING_ID)
                .bookingRef("KH-TEST01")
                .event(event)
                .userId(USER_ID)
                .state(BookingStatus.CONFIRMED)
                .buyerName("Dev Customer")
                .buyerPhoneE164("+85512345678")
                .subtotalUsdCents(2_500L * qty)
                .totalUsdCents(2_500L * qty)
                .fxRateKhrPerUsd(new BigDecimal("4100.0000"))
                .totalKhr(102_500L * qty)
                .createdAt(Instant.now())
                .stateChangedAt(Instant.now())
                .build();

        BookingItem item = BookingItem.builder()
                .id(11L)
                .eventZone(zone)
                .qty(qty)
                .unitPriceUsdCents(2_500)
                .build();
        booking.addItem(item);

        return booking;
    }
}
