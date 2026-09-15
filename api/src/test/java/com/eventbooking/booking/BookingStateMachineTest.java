package com.eventbooking.booking;

import com.eventbooking.service.booking.BookingStateMachine;
import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.exception.booking.IllegalBookingTransitionException;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingStatusHistory;
import com.eventbooking.repository.BookingStatusHistoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static com.eventbooking.Enumeration.BookingStatus.AWAITING_CONFIRMATION;
import static com.eventbooking.Enumeration.BookingStatus.CANCELLED;
import static com.eventbooking.Enumeration.BookingStatus.CONFIRMED;
import static com.eventbooking.Enumeration.BookingStatus.EXPIRED;
import static com.eventbooking.Enumeration.BookingStatus.PAYMENT_FAILED;
import static com.eventbooking.Enumeration.BookingStatus.PENDING_PAYMENT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The transition table and its audit guarantee, tested without a database -
 * the rules here are pure logic, and keeping this test fast means it can be
 * exhaustive over the enum rather than sampling it.
 */
class BookingStateMachineTest {

    private BookingStatusHistoryRepository historyRepository;
    private BookingStateMachine stateMachine;
    private List<BookingStatusHistory> saved;

    @BeforeEach
    void setUp() {
        historyRepository = mock(BookingStatusHistoryRepository.class);
        saved = new ArrayList<>();
        when(historyRepository.save(any(BookingStatusHistory.class))).thenAnswer(invocation -> {
            BookingStatusHistory entry = invocation.getArgument(0);
            saved.add(entry);
            return entry;
        });
        // A mock publisher: these tests are about the transition table, and the
        // notification it announces is somebody else's test.
        stateMachine = new BookingStateMachine(historyRepository, mock(ApplicationEventPublisher.class));
    }

    // ------------------------------------------------------------------
    // Legal edges
    // ------------------------------------------------------------------

    @Test
    void appliesALegalTransitionAndStampsTheBooking() {
        Booking booking = bookingIn(PENDING_PAYMENT);
        Instant before = booking.getStateChangedAt();

        stateMachine.transition(booking, AWAITING_CONFIRMATION, 42L, "KHQR invoice issued");

        assertThat(booking.getState()).isEqualTo(AWAITING_CONFIRMATION);
        assertThat(booking.getStateChangedAt()).isAfterOrEqualTo(before);
    }

    @Test
    void writesOneHistoryRowPerTransition() {
        Booking booking = bookingIn(PENDING_PAYMENT);

        stateMachine.transition(booking, AWAITING_CONFIRMATION, 42L, "KHQR invoice issued");
        stateMachine.transition(booking, CONFIRMED, null, "bakong-ref-991");

        assertThat(saved).hasSize(2);

        assertThat(saved.get(0).getFromState()).isEqualTo(PENDING_PAYMENT);
        assertThat(saved.get(0).getToState()).isEqualTo(AWAITING_CONFIRMATION);
        assertThat(saved.get(0).getChangedByUserId()).isEqualTo(42L);
        assertThat(saved.get(0).getNote()).isEqualTo("KHQR invoice issued");

        assertThat(saved.get(1).getFromState()).isEqualTo(AWAITING_CONFIRMATION);
        assertThat(saved.get(1).getToState()).isEqualTo(CONFIRMED);
        // Webhook-driven, so nobody to attribute it to.
        assertThat(saved.get(1).getChangedByUserId()).isNull();
    }

    @Test
    void recordsCreationWithNoPriorState() {
        Booking booking = bookingIn(PENDING_PAYMENT);

        stateMachine.recordCreation(booking, 42L, "Converted from hold 7");

        assertThat(saved).hasSize(1);
        assertThat(saved.getFirst().getFromState()).isNull();
        assertThat(saved.getFirst().getToState()).isEqualTo(PENDING_PAYMENT);
    }

    @Test
    void allowsRetryingAFailedPayment() {
        // The schema expects several payment attempts per booking, so a failure
        // must not strand the customer on inventory they can no longer pay for.
        assertThat(stateMachine.canTransition(PAYMENT_FAILED, PENDING_PAYMENT)).isTrue();
    }

    // ------------------------------------------------------------------
    // Illegal edges
    // ------------------------------------------------------------------

    @Test
    void rejectsAnIllegalTransitionAndLeavesTheBookingUntouched() {
        Booking booking = bookingIn(PENDING_PAYMENT);
        Instant before = booking.getStateChangedAt();

        assertThatThrownBy(() -> stateMachine.transition(booking, CONFIRMED, 42L, "skipping payment"))
                .isInstanceOf(IllegalBookingTransitionException.class)
                .hasMessageContaining("PENDING_PAYMENT")
                .hasMessageContaining("CONFIRMED");

        assertThat(booking.getState()).isEqualTo(PENDING_PAYMENT);
        assertThat(booking.getStateChangedAt()).isEqualTo(before);
    }

    @Test
    void writesNoHistoryRowForARefusedTransition() {
        Booking booking = bookingIn(CONFIRMED);

        assertThatThrownBy(() -> stateMachine.transition(booking, EXPIRED, null, "nope"))
                .isInstanceOf(IllegalBookingTransitionException.class);

        verifyNoInteractions(historyRepository);
    }

    @Test
    void refusesToUndoAPaidBooking() {
        // Money has changed hands and uq_payment_txn_one_success_per_booking
        // means it cannot quietly be un-charged. With no refund path there is
        // nowhere legal to go from CONFIRMED at all.
        assertThat(stateMachine.canTransition(CONFIRMED, CANCELLED)).isFalse();
        assertThat(stateMachine.canTransition(CONFIRMED, EXPIRED)).isFalse();
        assertThat(stateMachine.legalTargets(CONFIRMED)).isEmpty();
    }

    @Test
    void aPaidBookingIsADeadEndButKeepsItsSeats() {
        /*
         * The one that would have cost real money. CONFIRMED is a dead end, so
         * it is tempting to fold it in with EXPIRED and CANCELLED - and doing
         * that would release every paid booking's inventory the instant the
         * payment settled, putting sold seats back on sale.
         *
         * Dead end and releases-inventory are separate questions. This asserts
         * they stay separate.
         */
        assertThat(stateMachine.isDeadEnd(CONFIRMED)).isTrue();
        assertThat(stateMachine.releasesInventory(CONFIRMED)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(BookingStatus.class)
    void neverAllowsAStateToTransitionToItself(BookingStatus state) {
        assertThat(stateMachine.canTransition(state, state)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(value = BookingStatus.class, names = {"CONFIRMED", "EXPIRED", "CANCELLED"})
    void deadEndStatesHaveNoWayOut(BookingStatus deadEnd) {
        assertThat(stateMachine.isDeadEnd(deadEnd)).isTrue();
        assertThat(stateMachine.legalTargets(deadEnd)).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(value = BookingStatus.class, names = {"EXPIRED", "CANCELLED"})
    void onlyTheUnpaidDeadEndsGiveTheirSeatsBack(BookingStatus state) {
        assertThat(stateMachine.releasesInventory(state)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = BookingStatus.class, names = {"CONFIRMED", "EXPIRED", "CANCELLED"}, mode = EnumSource.Mode.EXCLUDE)
    void liveStatesCanAlwaysGoSomewhere(BookingStatus state) {
        // Guards against a future edit stranding a booking in a state that is
        // neither final nor escapable.
        assertThat(stateMachine.isDeadEnd(state)).isFalse();
        assertThat(stateMachine.legalTargets(state)).isNotEmpty();
    }

    @ParameterizedTest
    @EnumSource(BookingStatus.class)
    void everyStateIsAccountedForInTheTable(BookingStatus state) {
        // legalTargets falls back to an empty set for unknown states, which
        // would silently make a newly added status terminal. This asserts the
        // table was actually updated instead.
        assertThat(stateMachine.legalTargets(state))
                .as("%s must have an explicit entry in the transition table", state)
                .isNotNull();
        assertThat(stateMachine.isDeadEnd(state) || !stateMachine.legalTargets(state).isEmpty())
                .as("%s is neither a dead end nor has outgoing edges - was it added without updating the table?", state)
                .isTrue();
    }

    private static Booking bookingIn(BookingStatus state) {
        return Booking.builder()
                .id(1L)
                .state(state)
                .stateChangedAt(Instant.now().minusSeconds(60))
                .build();
    }
}
