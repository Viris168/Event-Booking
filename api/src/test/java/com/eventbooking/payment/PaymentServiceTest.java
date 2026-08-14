package com.eventbooking.payment;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.booking.BookingProperties;
import com.eventbooking.booking.BookingStateMachine;
import com.eventbooking.booking.error.BookingNotFoundException;
import com.eventbooking.dto.payment.PaymentResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingStatusHistory;
import com.eventbooking.model.PaymentTransaction;
import com.eventbooking.payment.bakong.BakongCheckResult;
import com.eventbooking.payment.bakong.KhqrGenerator;
import com.eventbooking.payment.error.BookingNotPayableException;
import com.eventbooking.payment.error.PaymentAlreadySettledException;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.BookingStatusHistoryRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The guarantees issue #31 asks for, tested without a database or a provider.
 *
 * <p>The state machine is real here rather than mocked - the point of most of
 * these tests is which booking transitions do and do not happen, and a mocked
 * machine would happily accept edges the real one refuses.
 */
class PaymentServiceTest {

    private static final Long USER_ID = 7L;
    private static final Long BOOKING_ID = 42L;
    private static final Long PAYMENT_ID = 99L;

    private PaymentTransactionRepository paymentRepository;
    private BookingRepository bookingRepository;
    private List<BookingStatusHistory> history;
    private PaymentService service;

    @BeforeEach
    void setUp() {
        paymentRepository = mock(PaymentTransactionRepository.class);
        bookingRepository = mock(BookingRepository.class);

        BookingStatusHistoryRepository historyRepository = mock(BookingStatusHistoryRepository.class);
        history = new ArrayList<>();
        when(historyRepository.save(any(BookingStatusHistory.class))).thenAnswer(invocation -> {
            BookingStatusHistory entry = invocation.getArgument(0);
            history.add(entry);
            return entry;
        });

        PaymentProperties properties = properties();
        service = new PaymentService(
                paymentRepository,
                bookingRepository,
                new BookingStateMachine(historyRepository),
                new KhqrGenerator(properties),
                new PaymentMapper(properties),
                properties,
                new BookingProperties(new BigDecimal("4100.0000"), 15));

        when(paymentRepository.save(any(PaymentTransaction.class))).thenAnswer(invocation -> {
            PaymentTransaction attempt = invocation.getArgument(0);
            attempt.setId(PAYMENT_ID);
            return attempt;
        });
    }

    // ------------------------------------------------------------------
    // Opening an attempt
    // ------------------------------------------------------------------

    @Test
    void issuesAKhqrAndPutsTheBookingIntoAwaitingConfirmation() {
        Booking booking = bookingIn(BookingStatus.PENDING_PAYMENT);
        givenBooking(booking);
        givenNoOpenAttempt();

        PaymentResponse response = service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, USER_ID);

        assertThat(response.status()).isEqualTo(PaymentStatus.CREATED);
        assertThat(response.qrPayload()).startsWith("000201");
        assertThat(response.providerRef()).hasSize(32); // md5, lowercase hex
        assertThat(response.amountKhr()).isEqualTo(102_500L);
        assertThat(response.open()).isTrue();

        assertThat(booking.getState()).isEqualTo(BookingStatus.AWAITING_CONFIRMATION);
        assertThat(response.bookingState()).isEqualTo(BookingStatus.AWAITING_CONFIRMATION);
    }

    @Test
    void handsBackTheSameQrRatherThanIssuingASecondOne() {
        // A refreshed pay screen, or a double-tapped button. Two open QRs would
        // both be payable, and the second payment would have nowhere to go.
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        givenBooking(booking);

        PaymentTransaction outstanding = openAttempt(booking, Instant.now().plusSeconds(120));
        when(paymentRepository.findFirstByBookingIdAndStatusInOrderByCreatedAtDesc(eq(BOOKING_ID), any()))
                .thenReturn(Optional.of(outstanding));

        PaymentResponse response = service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, USER_ID);

        assertThat(response.id()).isEqualTo(outstanding.getId());
        assertThat(response.qrPayload()).isEqualTo(outstanding.getQrPayload());
        assertThat(history).as("returning an existing attempt is not a state change").isEmpty();
    }

    @Test
    void closesAnExpiredAttemptBeforeOpeningTheNext() {
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        givenBooking(booking);

        PaymentTransaction lapsed = openAttempt(booking, Instant.now().minusSeconds(1));
        when(paymentRepository.findFirstByBookingIdAndStatusInOrderByCreatedAtDesc(eq(BOOKING_ID), any()))
                .thenReturn(Optional.of(lapsed));

        PaymentResponse response = service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, USER_ID);

        assertThat(lapsed.getStatus()).isEqualTo(PaymentStatus.EXPIRED);
        assertThat(response.providerRef()).isNotEqualTo(lapsed.getProviderRef());
    }

    @Test
    void refusesToChargeABookingThatIsAlreadyPaid() {
        Booking booking = bookingIn(BookingStatus.CONFIRMED);
        givenBooking(booking);

        assertThatThrownBy(() -> service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, USER_ID))
                .isInstanceOf(PaymentAlreadySettledException.class);
    }

    @Test
    void refusesToChargeABookingWhoseInventoryHasGoneBackOnSale() {
        Booking booking = bookingIn(BookingStatus.EXPIRED);
        givenBooking(booking);

        assertThatThrownBy(() -> service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, USER_ID))
                .isInstanceOf(BookingNotPayableException.class);
    }

    @Test
    void reportsSomebodyElsesBookingAsNotFound() {
        // Never "forbidden": that would confirm the id exists.
        givenBooking(bookingIn(BookingStatus.PENDING_PAYMENT));

        assertThatThrownBy(() -> service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, 999L))
                .isInstanceOf(BookingNotFoundException.class);
    }

    @Test
    void refusesToIssueAQrThatWouldOutliveTheBooking() {
        // Fourteen and a half minutes into a fifteen-minute payment window: the
        // sweeper is about to release these seats, so a QR issued now would be
        // taking money for inventory on its way to somebody else.
        Booking booking = bookingIn(BookingStatus.PENDING_PAYMENT);
        booking.setCreatedAt(Instant.now().minus(Duration.ofSeconds(14 * 60 + 50)));
        givenBooking(booking);
        givenNoOpenAttempt();

        assertThatThrownBy(() -> service.startPayment(BOOKING_ID, PaymentProvider.BAKONG_KHQR, USER_ID))
                .isInstanceOf(BookingNotPayableException.class);
    }

    // ------------------------------------------------------------------
    // Settlement, and settling twice
    // ------------------------------------------------------------------

    @Test
    void settlesAPaidAttemptAndConfirmsTheBooking() {
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().plusSeconds(120));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.paid("HASH-1", "ok"));

        assertThat(attempt.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(attempt.getResolvedAt()).isNotNull();
        assertThat(attempt.getProviderTxnHash()).isEqualTo("HASH-1");
        assertThat(booking.getState()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(history).hasSize(1);
    }

    @Test
    void pollingTwiceNeverConfirmsTwice() {
        // The guarantee issue #31 is really about. Polling asks the same
        // question over and over, so the second identical answer is the normal
        // case - it must change nothing at all.
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().plusSeconds(120));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.paid("HASH-1", "ok"));
        Instant firstResolvedAt = attempt.getResolvedAt();

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.paid("HASH-1", "ok"));

        assertThat(booking.getState()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(attempt.getResolvedAt()).isEqualTo(firstResolvedAt);
        assertThat(history)
                .as("a second CONFIRMED history row would mean the booking was confirmed twice")
                .hasSize(1);
    }

    @Test
    void flagsMoneyThatArrivesAfterTheAttemptWasGivenUpOn() {
        // Rare, and the reason the note column exists: the attempt had already
        // expired here, so recording a SUCCESS could collide with a later
        // attempt's success row. It is left for a human to refund instead.
        Booking booking = bookingIn(BookingStatus.PAYMENT_FAILED);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().minusSeconds(60));
        attempt.setStatus(PaymentStatus.EXPIRED);
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.paid("HASH-LATE", "ok"));

        assertThat(attempt.getStatus()).isEqualTo(PaymentStatus.EXPIRED);
        assertThat(attempt.getNote()).contains("manual reconciliation");
        assertThat(booking.getState()).isEqualTo(BookingStatus.PAYMENT_FAILED);
        assertThat(history).isEmpty();
    }

    @Test
    void doesNotConfirmABookingThatHasAlreadyDied() {
        // Its seats went back on sale when it expired; confirming would sell
        // them twice. The payment stands, flagged for a refund.
        Booking booking = bookingIn(BookingStatus.EXPIRED);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().plusSeconds(60));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.paid("HASH-2", "ok"));

        assertThat(attempt.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(attempt.getNote()).contains("manual refund");
        assertThat(booking.getState()).isEqualTo(BookingStatus.EXPIRED);
        assertThat(history).isEmpty();
    }

    // ------------------------------------------------------------------
    // Not paid yet, and the timeout
    // ------------------------------------------------------------------

    @Test
    void marksAnUnpaidAttemptPendingWithoutTouchingTheBooking() {
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().plusSeconds(120));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.notFound("no transaction yet"));

        assertThat(attempt.getStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(attempt.getPollAttempts()).isEqualTo(1);
        assertThat(attempt.getLastPolledAt()).isNotNull();
        assertThat(booking.getState()).isEqualTo(BookingStatus.AWAITING_CONFIRMATION);
        assertThat(history).isEmpty();
    }

    @Test
    void expiresALapsedQrAndLetsTheCustomerTryAgain() {
        // The timeout path. PAYMENT_FAILED is not terminal, so the seats are
        // still theirs - releasing those is the booking payment window's job.
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().minusSeconds(1));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.notFound("no transaction yet"));

        assertThat(attempt.getStatus()).isEqualTo(PaymentStatus.EXPIRED);
        assertThat(booking.getState()).isEqualTo(BookingStatus.PAYMENT_FAILED);
        assertThat(history).hasSize(1);
    }

    @Test
    void neverFailsABookingBecauseTheProviderIsDown() {
        // "We could not ask" must never be read as "not paid".
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().plusSeconds(120));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.unavailable("connect timed out"));

        assertThat(attempt.isOpen()).isTrue();
        assertThat(attempt.getNote()).contains("connect timed out");
        assertThat(booking.getState()).isEqualTo(BookingStatus.AWAITING_CONFIRMATION);
        assertThat(history).isEmpty();
    }

    @Test
    void stillExpiresALapsedQrWhenTheProviderCannotBeReached() {
        Booking booking = bookingIn(BookingStatus.AWAITING_CONFIRMATION);
        PaymentTransaction attempt = openAttempt(booking, Instant.now().minusSeconds(1));
        givenAttemptUnderLock(booking, attempt);

        service.applyProviderResult(PAYMENT_ID, BakongCheckResult.unavailable("connect timed out"));

        assertThat(attempt.getStatus()).isEqualTo(PaymentStatus.EXPIRED);
        assertThat(booking.getState()).isEqualTo(BookingStatus.PAYMENT_FAILED);
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    private void givenBooking(Booking booking) {
        when(bookingRepository.findByIdForUpdate(BOOKING_ID)).thenReturn(Optional.of(booking));
    }

    @SuppressWarnings("unchecked")
    private void givenNoOpenAttempt() {
        when(paymentRepository.findFirstByBookingIdAndStatusInOrderByCreatedAtDesc(
                anyLong(), any(Collection.class))).thenReturn(Optional.empty());
        when(paymentRepository.countByBookingId(BOOKING_ID)).thenReturn(0L);
    }

    private void givenAttemptUnderLock(Booking booking, PaymentTransaction attempt) {
        when(paymentRepository.findBookingIdOf(PAYMENT_ID)).thenReturn(Optional.of(BOOKING_ID));
        when(bookingRepository.findByIdForUpdate(BOOKING_ID)).thenReturn(Optional.of(booking));
        when(paymentRepository.findByIdForUpdate(PAYMENT_ID)).thenReturn(Optional.of(attempt));
    }

    private static Booking bookingIn(BookingStatus state) {
        return Booking.builder()
                .id(BOOKING_ID)
                .bookingRef("KH-TEST01")
                .userId(USER_ID)
                .state(state)
                .subtotalUsdCents(2_500L)
                .totalUsdCents(2_500L)
                .fxRateKhrPerUsd(new BigDecimal("4100.0000"))
                .totalKhr(102_500L)
                .createdAt(Instant.now().minusSeconds(30))
                .stateChangedAt(Instant.now().minusSeconds(30))
                .build();
    }

    private static PaymentTransaction openAttempt(Booking booking, Instant expiresAt) {
        return PaymentTransaction.builder()
                .id(PAYMENT_ID)
                .booking(booking)
                .provider(PaymentProvider.BAKONG_KHQR)
                .providerRef("d41d8cd98f00b204e9800998ecf8427e")
                .idempotencyKey("KHQR-KH-TEST01-1")
                .currencyCharged(PaymentCurrency.KHR)
                .amountUsdCents(2_500L)
                .amountKhr(102_500L)
                .status(PaymentStatus.CREATED)
                .expiresAt(expiresAt)
                .createdAt(Instant.now().minusSeconds(10))
                .qrPayload("00020101021229...")
                .pollAttempts(0)
                .build();
    }

    private static PaymentProperties properties() {
        return new PaymentProperties(
                new PaymentProperties.Bakong(
                        PaymentProperties.BakongMode.MOCK,
                        "http://localhost",
                        "",
                        "event_booking@dev",
                        PaymentProperties.BakongAccountType.INDIVIDUAL,
                        null,
                        null,
                        "Event Booking KH",
                        "Phnom Penh",
                        "5999",
                        "EventBooking",
                        "WEB",
                        PaymentCurrency.KHR,
                        Duration.ofMinutes(5),
                        Duration.ofSeconds(3),
                        Duration.ofSeconds(5)),
                new PaymentProperties.Poll(true, Duration.ofSeconds(5), 50,
                        Duration.ofSeconds(3), Duration.ofMinutes(1)));
    }
}
