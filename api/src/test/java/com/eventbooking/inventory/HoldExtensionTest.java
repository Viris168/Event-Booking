package com.eventbooking.inventory;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.inventory.error.HoldAlreadyExtendedException;
import com.eventbooking.inventory.error.HoldExpiredException;
import com.eventbooking.inventory.error.HoldNotActiveException;
import com.eventbooking.inventory.error.HoldNotFoundException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.Hold;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.VenueSeat;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.repository.HoldZoneLineRepository;
import com.eventbooking.service.hold.impl.HoldServiceimpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The one-time hold extension.
 *
 * <p>Mocked rather than run against Postgres because every rule here is
 * decided in Java - the status switch, the expires_at check, the extended flag -
 * so a database would only slow down a test that can be exhaustive instead.
 * The locking these methods depend on is covered by HoldConcurrencyIT.
 */
class HoldExtensionTest {

    private static final long HOLD_ID = 7L;
    private static final long USER_ID = 42L;
    private static final int EXTENSION_MINUTES = 3;

    private HoldRepository holdRepository;
    private EventSeatRepository eventSeatRepository;
    private HoldZoneLineRepository holdZoneLineRepository;
    private HoldServiceimpl service;

    @BeforeEach
    void setUp() {
        holdRepository = mock(HoldRepository.class);
        eventSeatRepository = mock(EventSeatRepository.class);
        holdZoneLineRepository = mock(HoldZoneLineRepository.class);

        when(eventSeatRepository.findByHoldId(anyLong())).thenReturn(List.of());
        when(eventSeatRepository.findByHoldIdForUpdate(anyLong())).thenReturn(List.of());
        when(holdZoneLineRepository.findByHoldId(anyLong())).thenReturn(List.of());

        service = new HoldServiceimpl(
                mock(EventRepository.class),
                mock(AppUserRepository.class),
                holdRepository,
                eventSeatRepository,
                mock(EventZoneRepository.class),
                holdZoneLineRepository,
                new HoldProperties(10, EXTENSION_MINUTES, 30_000L));
    }

    // ------------------------------------------------------------------
    // The happy path
    // ------------------------------------------------------------------

    @Test
    void addsTheConfiguredWindowAndSpendsTheOneExtension() {
        Instant deadline = Instant.now().plus(4, ChronoUnit.MINUTES);
        Hold hold = activeHold(deadline, false);

        HoldResponse response = service.extendHold(HOLD_ID, USER_ID);

        assertThat(hold.getExtended()).isTrue();
        assertThat(hold.getExpiresAt()).isEqualTo(deadline.plus(EXTENSION_MINUTES, ChronoUnit.MINUTES));
        assertThat(response.expiresAt()).isEqualTo(hold.getExpiresAt());
        assertThat(response.extended()).isTrue();
    }

    /**
     * The extension is measured from the existing deadline, not from now.
     * Measuring from now would silently confiscate the time still on the clock
     * from anyone who extended early.
     */
    @Test
    void measuresFromTheExistingDeadlineNotFromNow() {
        Instant deadline = Instant.now().plus(9, ChronoUnit.MINUTES);
        Hold hold = activeHold(deadline, false);

        service.extendHold(HOLD_ID, USER_ID);

        assertThat(hold.getExpiresAt())
                .isEqualTo(deadline.plus(EXTENSION_MINUTES, ChronoUnit.MINUTES))
                .isAfter(Instant.now().plus(EXTENSION_MINUTES, ChronoUnit.MINUTES));
    }

    /**
     * event_seat keeps its own copy of the deadline for the seat-map query, so
     * leaving it behind would have the map offer these seats to someone else
     * while the hold was still live.
     */
    @Test
    void cascadesTheNewDeadlineOntoTheHeldSeats() {
        Instant deadline = Instant.now().plus(5, ChronoUnit.MINUTES);
        Hold hold = activeHold(deadline, false);

        EventSeat seat = heldSeat(deadline);
        when(eventSeatRepository.findByHoldIdForUpdate(HOLD_ID)).thenReturn(List.of(seat));

        service.extendHold(HOLD_ID, USER_ID);

        assertThat(seat.getHoldExpiresAt()).isEqualTo(hold.getExpiresAt());
    }

    // ------------------------------------------------------------------
    // Refusals
    // ------------------------------------------------------------------

    @Test
    void refusesASecondExtension() {
        Instant deadline = Instant.now().plus(6, ChronoUnit.MINUTES);
        Hold hold = activeHold(deadline, true);

        assertThatThrownBy(() -> service.extendHold(HOLD_ID, USER_ID))
                .isInstanceOf(HoldAlreadyExtendedException.class);

        // The refusal must not move the clock it declined to extend.
        assertThat(hold.getExpiresAt()).isEqualTo(deadline);
    }

    @Test
    void refusesAHoldThatIsNotTheCallers() {
        when(holdRepository.findOwnedByIdForUpdate(HOLD_ID, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.extendHold(HOLD_ID, USER_ID))
                .isInstanceOf(HoldNotFoundException.class);
    }

    @ParameterizedTest
    @EnumSource(value = HoldStatus.class, names = {"CONSUMED", "RELEASED"})
    void refusesAHoldThatIsNoLongerActive(HoldStatus status) {
        Hold hold = holdWith(status, Instant.now().plus(5, ChronoUnit.MINUTES), false);
        when(holdRepository.findOwnedByIdForUpdate(HOLD_ID, USER_ID)).thenReturn(Optional.of(hold));

        assertThatThrownBy(() -> service.extendHold(HOLD_ID, USER_ID))
                .isInstanceOf(HoldNotActiveException.class);
    }

    @Test
    void refusesAHoldAlreadyFlaggedExpired() {
        Hold hold = holdWith(HoldStatus.EXPIRED, Instant.now().minusSeconds(30), false);
        when(holdRepository.findOwnedByIdForUpdate(HOLD_ID, USER_ID)).thenReturn(Optional.of(hold));

        assertThatThrownBy(() -> service.extendHold(HOLD_ID, USER_ID))
                .isInstanceOf(HoldExpiredException.class);
    }

    /**
     * expires_at is the authority, not status: the sweeper runs on an interval,
     * so a lapsed hold is routinely still flagged ACTIVE for a few seconds. An
     * extension granted in that window would resurrect seats already back on
     * sale.
     */
    @Test
    void refusesAStillActiveHoldWhoseClockHasRunOutAndReleasesIt() {
        Hold hold = activeHold(Instant.now().minusSeconds(5), false);

        EventSeat seat = heldSeat(Instant.now().minusSeconds(5));
        when(eventSeatRepository.findByHoldIdForUpdate(HOLD_ID)).thenReturn(List.of(seat));

        assertThatThrownBy(() -> service.extendHold(HOLD_ID, USER_ID))
                .isInstanceOf(HoldExpiredException.class);

        assertThat(hold.getExtended()).isFalse();
        assertThat(hold.getStatus()).isEqualTo(HoldStatus.EXPIRED);
        // Released on the way out rather than left for the sweeper - which is
        // what the noRollbackFor on extendHold exists to preserve.
        assertThat(seat.getStatus()).isEqualTo(SeatStatus.AVAILABLE);
        assertThat(seat.getHoldId()).isNull();
        assertThat(seat.getHoldExpiresAt()).isNull();
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    private Hold activeHold(Instant expiresAt, boolean extended) {
        Hold hold = holdWith(HoldStatus.ACTIVE, expiresAt, extended);
        when(holdRepository.findOwnedByIdForUpdate(HOLD_ID, USER_ID)).thenReturn(Optional.of(hold));
        return hold;
    }

    private Hold holdWith(HoldStatus status, Instant expiresAt, boolean extended) {
        Event event = new Event();
        event.setId(99L);

        AppUser user = new AppUser();
        user.setId(USER_ID);

        return Hold.builder()
                .id(HOLD_ID)
                .event(event)
                .user(user)
                .status(status)
                .expiresAt(expiresAt)
                .createdAt(Instant.now().minus(2, ChronoUnit.MINUTES))
                .extended(extended)
                .build();
    }

    private EventSeat heldSeat(Instant holdExpiresAt) {
        SeatClass seatClass = new SeatClass();
        seatClass.setPriceUsdCents(2500);

        VenueSeat venueSeat = new VenueSeat();
        venueSeat.setSectionLabel("A");
        venueSeat.setRowLabel("1");
        venueSeat.setSeatNumber("4");

        EventSeat seat = new EventSeat();
        seat.setId(1234L);
        seat.setStatus(SeatStatus.HELD);
        seat.setHoldId(HOLD_ID);
        seat.setHoldExpiresAt(holdExpiresAt);
        seat.setSeatClass(seatClass);
        seat.setVenueSeat(venueSeat);
        return seat;
    }
}
