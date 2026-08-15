package com.eventbooking.ticket;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.InventoryMode;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import com.eventbooking.model.Ticket;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.TicketRepository;
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
    private static final String SECRET = "test-secret-that-is-long-enough-to-pass-32";

    private TicketRepository ticketRepository;
    private BookingRepository bookingRepository;
    private AppUserRepository appUserRepository;
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

        TicketProperties properties = new TicketProperties(SECRET, 256, 4);
        codec = new TicketTokenCodec(properties);
        service = new TicketService(
                ticketRepository, bookingRepository, appUserRepository, codec,
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
        // It has to still work at its own gate afterwards.
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
    void admitsWhenNoEventIsNamedButSaysSoInTheDocs() {
        // Documented behaviour rather than desired: a gate that omits eventId
        // accepts any event's ticket.
        Ticket ticket = issuedTicket();
        givenTicketUnderLock(ticket);

        assertThat(service.scan(payloadFor(ticket), null, OPERATOR_ID).admitted()).isTrue();
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
