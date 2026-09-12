package com.eventbooking.booking;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.booking.error.IllegalBookingTransitionException;
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
 * Customer cancellation and the refund path.
 *
 * <p>The transition table itself is BookingStateMachineTest's job; what is
 * tested here is the part BookingService adds on top - who is allowed to do it,
 * what happens to the inventory, and what happens to a payment attempt that is
 * still open when the booking dies.
 */
class BookingCancelRefundTest {

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

        service = new BookingService(
                bookingRepository,
                mock(HoldRepository.class),
                mock(HoldZoneLineRepository.class),
                mock(EventSeatRepository.class),
                eventZoneRepository,
                paymentTransactionRepository,
                new BookingStateMachine(historyRepository, mock(ApplicationEventPublisher.class)),
                mock(BookingRefGenerator.class),
                new BookingMapper(),
                new BookingProperties(new BigDecimal("4100.0000"), 15));
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
    // Refund
    // ------------------------------------------------------------------

    @Test
    void requestsARefundOnAConfirmedBooking() {
        Booking booking = bookingIn(BookingStatus.CONFIRMED);

        BookingResponse response = service.requestRefundForUser(BOOKING_ID, OWNER_ID, "cannot attend");

        assertThat(response.state()).isEqualTo(BookingStatus.REFUND_REQUESTED);
        assertThat(booking.getState()).isEqualTo(BookingStatus.REFUND_REQUESTED);
        assertThat(history).singleElement()
                .satisfies(entry -> assertThat(entry.getNote())
                        .isEqualTo("Refund requested by customer: cannot attend"));
    }

    /**
     * REFUND_REQUESTED is not terminal, and that is the whole point: freeing the
     * seat here would resell a seat the refund might still be refused for, and
     * would let the customer walk in on a ticket they had asked to be refunded.
     */
    @Test
    void requestingARefundLeavesTheSeatSoldAndTheTicketValid() {
        Booking booking = bookingIn(BookingStatus.CONFIRMED);
        EventSeat seat = soldSeat();
        booking.addItem(BookingItem.builder().eventSeat(seat).qty(1).unitPriceUsdCents(2500).build());

        service.requestRefundForUser(BOOKING_ID, OWNER_ID, null);

        assertThat(seat.getStatus()).isEqualTo(SeatStatus.SOLD);
        assertThat(booking.getItems()).singleElement()
                .satisfies(item -> assertThat(item.getReleasedAt()).isNull());
    }

    @Test
    void refusesARefundOnAnUnpaidBooking() {
        bookingIn(BookingStatus.PENDING_PAYMENT);

        assertThatThrownBy(() -> service.requestRefundForUser(BOOKING_ID, OWNER_ID, null))
                .isInstanceOf(IllegalBookingTransitionException.class);
    }

    @Test
    void refusesARefundRequestOnSomebodyElsesBooking() {
        bookingIn(BookingStatus.CONFIRMED);

        assertThatThrownBy(() -> service.requestRefundForUser(BOOKING_ID, STRANGER_ID, null))
                .isInstanceOf(BookingNotFoundException.class);
    }

    // ------------------------------------------------------------------
    // Refund moderation
    // ------------------------------------------------------------------

    @Test
    void approvingARefundReleasesTheInventory() {
        Booking booking = bookingIn(BookingStatus.REFUND_REQUESTED);
        EventSeat seat = soldSeat();
        booking.addItem(BookingItem.builder().eventSeat(seat).qty(1).unitPriceUsdCents(2500).build());

        BookingResponse response = service.approveRefund(BOOKING_ID, ADMIN_ID, "settled by wire");

        assertThat(response.state()).isEqualTo(BookingStatus.REFUNDED);
        assertThat(seat.getStatus()).isEqualTo(SeatStatus.AVAILABLE);
        assertThat(history).singleElement().satisfies(entry -> {
            assertThat(entry.getChangedByUserId()).isEqualTo(ADMIN_ID);
            assertThat(entry.getNote()).isEqualTo("Refund approved: settled by wire");
        });
    }

    @Test
    void rejectingARefundReturnsTheBookingToConfirmedAndKeepsTheSeatSold() {
        Booking booking = bookingIn(BookingStatus.REFUND_REQUESTED);
        EventSeat seat = soldSeat();
        booking.addItem(BookingItem.builder().eventSeat(seat).qty(1).unitPriceUsdCents(2500).build());

        BookingResponse response = service.rejectRefund(BOOKING_ID, ADMIN_ID, "outside policy");

        assertThat(response.state()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(seat.getStatus()).isEqualTo(SeatStatus.SOLD);
        assertThat(booking.getItems()).singleElement()
                .satisfies(item -> assertThat(item.getReleasedAt()).isNull());
    }

    @Test
    void refusesToDecideARefundThatWasNeverRequested() {
        bookingIn(BookingStatus.PENDING_PAYMENT);

        assertThatThrownBy(() -> service.approveRefund(BOOKING_ID, ADMIN_ID, null))
                .isInstanceOf(IllegalBookingTransitionException.class);
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
