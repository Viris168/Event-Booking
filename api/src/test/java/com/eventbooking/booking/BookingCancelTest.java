package com.eventbooking.booking;

import com.eventbooking.mapper.Booking.BookingMapper;
import com.eventbooking.config.BookingProperties;
import com.eventbooking.service.booking.BookingRefGenerator;
import com.eventbooking.service.booking.BookingService;
import com.eventbooking.service.booking.BookingStateMachine;
import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.exception.booking.BookingNotFoundException;
import com.eventbooking.exception.booking.IllegalBookingTransitionException;
import com.eventbooking.dto.booking.BookingResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.BookingStatusHistory;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.Hold;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.model.SeatClass;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.BookingStatusHistoryRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.repository.HoldZoneLineRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.repository.TicketRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Customer cancellation.
 *
 * <p>The transition table itself is BookingStateMachineTest's job; what is
 * tested here is the part BookingService adds on top - who is allowed to do it,
 * what happens to the inventory, and what happens to a payment attempt that is
 * still open when the booking dies.
 */
class BookingCancelTest {

    private static final long BOOKING_ID = 5L;
    private static final long OWNER_ID = 11L;
    private static final long STRANGER_ID = 12L;
    private static final long ADMIN_ID = 99L;

    private BookingRepository bookingRepository;
    private PaymentTransactionRepository paymentTransactionRepository;
    private BookingService service;
    private List<BookingStatusHistory> history;

    @BeforeEach
    void setUp() {
        bookingRepository = mock(BookingRepository.class);
        paymentTransactionRepository = mock(PaymentTransactionRepository.class);
        EventZoneRepository eventZoneRepository = mock(EventZoneRepository.class);

        BookingStatusHistoryRepository historyRepository = mock(BookingStatusHistoryRepository.class);
        history = new ArrayList<>();
        when(historyRepository.save(any(BookingStatusHistory.class))).thenAnswer(invocation -> {
            BookingStatusHistory entry = invocation.getArgument(0);
            history.add(entry);
            return entry;
        });

        when(paymentTransactionRepository.findByBookingIdOrderByCreatedAtDesc(anyLong()))
                .thenReturn(List.of());

        BookingProperties properties = new BookingProperties(new BigDecimal("4100.0000"), 15);
        service = new BookingService(
                bookingRepository,
                mock(HoldRepository.class),
                mock(HoldZoneLineRepository.class),
                mock(EventSeatRepository.class),
                eventZoneRepository,
                paymentTransactionRepository,
                new BookingStateMachine(historyRepository, mock(ApplicationEventPublisher.class)),
                mock(BookingRefGenerator.class),
                new BookingMapper(properties),
                properties,
                mock(TicketRepository.class));
    }

    // ------------------------------------------------------------------
    // Cancel
    // ------------------------------------------------------------------

    @ParameterizedTest
    @EnumSource(value = BookingStatus.class,
            names = {"PENDING_PAYMENT", "AWAITING_CONFIRMATION", "PAYMENT_FAILED"})
    void cancelsFromEveryUnpaidState(BookingStatus from) {
        Booking booking = bookingIn(from);

        BookingResponse response = service.cancelForUser(BOOKING_ID, OWNER_ID, null);

        assertThat(response.state()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(booking.getState()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(history).singleElement()
                .satisfies(entry -> assertThat(entry.getToState()).isEqualTo(BookingStatus.CANCELLED));
    }

    @Test
    void cancellingPutsTheSeatBackOnSaleAndClosesTheLine() {
        Booking booking = bookingIn(BookingStatus.PENDING_PAYMENT);
        EventSeat seat = soldSeat();
        booking.addItem(BookingItem.builder().eventSeat(seat).qty(1).unitPriceUsdCents(2500).build());

        service.cancelForUser(BOOKING_ID, OWNER_ID, null);

        assertThat(seat.getStatus()).isEqualTo(SeatStatus.AVAILABLE);
        // The line survives as financial history; releasedAt is what frees the
        // seat, because uq_booking_item_seat_live only counts unreleased lines.
        assertThat(booking.getItems()).singleElement()
                .satisfies(item -> assertThat(item.getReleasedAt()).isNotNull());
    }

    /**
     * An attempt left CREATED would keep the poller asking Bakong about a QR
     * nobody can pay - and that account is capped at 100 requests a day.
     */
    @Test
    void cancellingClosesAnyStillOpenPaymentAttempt() {
        bookingIn(BookingStatus.AWAITING_CONFIRMATION);

        PaymentTransaction open = attempt(PaymentStatus.CREATED);
        PaymentTransaction settled = attempt(PaymentStatus.FAILED);
        when(paymentTransactionRepository.findByBookingIdOrderByCreatedAtDesc(BOOKING_ID))
                .thenReturn(List.of(open, settled));

        service.cancelForUser(BOOKING_ID, OWNER_ID, null);

        assertThat(open.getStatus()).isEqualTo(PaymentStatus.CANCELLED);
        assertThat(open.getResolvedAt()).isNotNull();
        // An already-resolved attempt is left exactly as the provider left it.
        assertThat(settled.getStatus()).isEqualTo(PaymentStatus.FAILED);
    }

    @Test
    void refusesToCancelAPaidBooking() {
        Booking booking = bookingIn(BookingStatus.CONFIRMED);

        assertThatThrownBy(() -> service.cancelForUser(BOOKING_ID, OWNER_ID, null))
                .isInstanceOf(IllegalBookingTransitionException.class);

        assertThat(booking.getState()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(history).isEmpty();
    }

    /** Somebody else's booking is "not found", so ids cannot be walked. */
    @Test
    void refusesToCancelSomebodyElsesBooking() {
        bookingIn(BookingStatus.PENDING_PAYMENT);

        assertThatThrownBy(() -> service.cancelForUser(BOOKING_ID, STRANGER_ID, null))
                .isInstanceOf(BookingNotFoundException.class);

        assertThat(history).isEmpty();
    }

    @Test
    void cancellingTwiceIsANoOpRatherThanAConflict() {
        bookingIn(BookingStatus.CANCELLED);

        BookingResponse response = service.cancelForUser(BOOKING_ID, OWNER_ID, null);

        assertThat(response.state()).isEqualTo(BookingStatus.CANCELLED);
        // No second history row: the audit trail stays one row per real change.
        assertThat(history).isEmpty();
    }

    @Test
    void recordsTheCustomersReasonOnTheAuditRow() {
        bookingIn(BookingStatus.PENDING_PAYMENT);

        service.cancelForUser(BOOKING_ID, OWNER_ID, "  double booked  ");

        assertThat(history).singleElement()
                .satisfies(entry -> assertThat(entry.getNote())
                        .isEqualTo("Cancelled by customer: double booked"));
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    /**
     * Both the unlocked ownership read and the locking re-read return the same
     * instance, which is what the real code sees too: inside one transaction
     * the persistence context hands back the same managed entity.
     */
    private Booking bookingIn(BookingStatus state) {
        Event event = new Event();
        event.setId(77L);

        Hold hold = Hold.builder().id(3L).build();

        Instant now = Instant.now();
        Booking booking = Booking.builder()
                .id(BOOKING_ID)
                .bookingRef("EB-TEST-0001")
                .event(event)
                .userId(OWNER_ID)
                .hold(hold)
                .state(state)
                .subtotalUsdCents(2500L)
                .totalUsdCents(2500L)
                .fxRateKhrPerUsd(new BigDecimal("4100.0000"))
                .totalKhr(102_500L)
                .createdAt(now)
                .stateChangedAt(now)
                .build();

        when(bookingRepository.findById(BOOKING_ID)).thenReturn(Optional.of(booking));
        when(bookingRepository.findByIdForUpdate(BOOKING_ID)).thenReturn(Optional.of(booking));
        return booking;
    }

    private EventSeat soldSeat() {
        SeatClass seatClass = new SeatClass();
        seatClass.setPriceUsdCents(2500);

        EventSeat seat = new EventSeat();
        seat.setId(201L);
        seat.setStatus(SeatStatus.SOLD);
        seat.setSeatClass(seatClass);
        return seat;
    }

    private PaymentTransaction attempt(PaymentStatus status) {
        PaymentTransaction txn = new PaymentTransaction();
        txn.setStatus(status);
        return txn;
    }
}
