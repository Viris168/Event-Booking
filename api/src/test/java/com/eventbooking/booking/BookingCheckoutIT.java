package com.eventbooking.booking;

import com.eventbooking.booking.error.IllegalBookingTransitionException;
import com.eventbooking.dto.booking.CheckoutRequest;
import com.eventbooking.inventory.error.HoldExpiredException;
import com.eventbooking.model.Booking;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static com.eventbooking.Enumeration.BookingStatus.AWAITING_CONFIRMATION;
import static com.eventbooking.Enumeration.BookingStatus.CANCELLED;
import static com.eventbooking.Enumeration.BookingStatus.CONFIRMED;
import static com.eventbooking.Enumeration.BookingStatus.PENDING_PAYMENT;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Checkout against a real Postgres, because the parts most likely to break are
 * the parts H2 cannot model: the plpgsql mode guards, the partial unique
 * indexes, and the row locks the conversion relies on.
 *
 * The test is not @Transactional on purpose. Each service call has to commit
 * on its own for the assertions to mean anything - especially the expired-hold
 * case, where the whole point is that the inventory release survives the
 * exception that follows it.
 *
 * Booting the full context also runs Hibernate's schema validation against
 * V1 + V2, so an entity that drifts from the migrations fails here first.
 */
@SpringBootTest
@Testcontainers
class BookingCheckoutIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("event_booking_test")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.jpa.show-sql", () -> "false");
        // Pinned so the KHR assertions below are arithmetic, not a guess at
        // whatever the environment happens to configure.
        registry.add("app.booking.fx-khr-per-usd", () -> "4100.0000");
    }

    private static final AtomicInteger SEQ = new AtomicInteger();

    private static final int SEAT_PRICE_CENTS = 2500;
    private static final int ZONE_PRICE_CENTS = 1000;
    private static final int ZONE_CAPACITY = 100;

    @Autowired
    private BookingService bookingService;

    @Autowired
    private JdbcTemplate jdbc;

    private long customerId;
    private long eventId;
    private long seatId;
    private long zoneId;

    /**
     * A private event, seat and zone per test. Isolating them this way beats
     * cleaning up between tests, and it sidesteps
     * uq_hold_one_active_per_user_event, which is scoped per (event, user).
     */
    @BeforeEach
    void seedFixture() {
        int n = SEQ.incrementAndGet();

        jdbc.update("INSERT INTO province_ref (code, name_en, name_km) VALUES ('PP', 'Phnom Penh', 'PP') "
                + "ON CONFLICT (code) DO NOTHING");

        long organizerUserId = insertId(
                "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                        + "VALUES (?, ?, 'x', 'Organizer', 'ORGANIZER') RETURNING id",
                phone(n * 2), "organizer" + n + "@example.com");

        customerId = insertId(
                "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                        + "VALUES (?, ?, 'x', 'Customer', 'CUSTOMER') RETURNING id",
                phone(n * 2 + 1), "customer" + n + "@example.com");

        long organizerId = insertId(
                "INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) VALUES (?, 'Acme', 'Acme') RETURNING id",
                organizerUserId);

        long venueId = insertId(
                "INSERT INTO venue (organizer_id, name_en, name_km, province_code, khan_district, sangkat_commune, street_address) "
                        + "VALUES (?, 'Diamond Island', 'Diamond Island', 'PP', 'Chamkarmon', 'Tonle Bassac', '#1 St 371') RETURNING id",
                organizerId);

        // MIXED so one hold can carry both an assigned seat and GA capacity -
        // the case the booking_item CHECK constraint exists for.
        eventId = insertId(
                "INSERT INTO event (organizer_id, venue_id, inventory_mode, slug, title_en, title_km, "
                        + "starts_at, doors_open_at, sales_open_at, sales_close_at) "
                        + "VALUES (?, ?, 'MIXED', ?, 'Test Event', 'Test Event', "
                        + "now() + interval '2 days', now() + interval '2 days', "
                        + "now() - interval '1 day', now() + interval '1 day') RETURNING id",
                organizerId, venueId, "test-event-" + n);

        long seatClassId = insertId(
                "INSERT INTO seat_class (event_id, name_en, name_km, price_usd_cents) "
                        + "VALUES (?, 'Zone A', 'Zone A', ?) RETURNING id",
                eventId, SEAT_PRICE_CENTS);

        long venueSeatId = insertId(
                "INSERT INTO venue_seat (venue_id, section_label, row_label, seat_number, pos_x, pos_y) "
                        + "VALUES (?, 'A', '1', '1', 0, 0) RETURNING id",
                venueId);

        seatId = insertId(
                "INSERT INTO event_seat (event_id, venue_seat_id, seat_class_id) VALUES (?, ?, ?) RETURNING id",
                eventId, venueSeatId, seatClassId);

        zoneId = insertId(
                "INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity) "
                        + "VALUES (?, 'GA Floor', 'GA Floor', ?, ?) RETURNING id",
                eventId, ZONE_PRICE_CENTS, ZONE_CAPACITY);
    }

    // ------------------------------------------------------------------
    // Conversion
    // ------------------------------------------------------------------

    @Test
    void convertsAMixedHoldIntoAPendingBooking() {
        long holdId = placeHold("10 minutes", 3);

        Booking booking = bookingService.convertHold(checkout(holdId), customerId);

        assertThat(booking.getState()).isEqualTo(PENDING_PAYMENT);
        assertThat(booking.getBookingRef()).startsWith("KH-");

        // 1 seat @ $25.00 + 3 GA @ $10.00 = $55.00
        assertThat(booking.getSubtotalUsdCents()).isEqualTo(5500L);
        assertThat(booking.getTotalUsdCents()).isEqualTo(5500L);
        assertThat(booking.getTotalKhr()).isEqualTo(225_500L);
        assertThat(booking.getFxRateKhrPerUsd()).isEqualByComparingTo("4100.0000");
        assertThat(booking.getItems()).hasSize(2);

        // The seat is sold and no longer points at the hold, so the partial
        // index idx_event_seat_hold stops tracking it.
        assertThat(seatStatus()).isEqualTo("SOLD");
        assertThat(jdbc.queryForObject("SELECT hold_id FROM event_seat WHERE id = ?", Long.class, seatId)).isNull();

        // Zone capacity moves across rather than being released and re-taken,
        // so held + sold never exceeds capacity even for an instant.
        assertThat(zoneCount("held_qty")).isZero();
        assertThat(zoneCount("sold_qty")).isEqualTo(3);

        assertThat(holdStatus(holdId)).isEqualTo("CONSUMED");
    }

    @Test
    void recordsCreationInTheAuditTrail() {
        long holdId = placeHold("10 minutes", 1);

        Booking booking = bookingService.convertHold(checkout(holdId), customerId);

        List<String> states = historyToStates(booking.getId());
        assertThat(states).containsExactly("PENDING_PAYMENT");
        assertThat(jdbc.queryForObject(
                "SELECT from_state FROM booking_status_history WHERE booking_id = ?", String.class, booking.getId()))
                .isNull();
    }

    @Test
    void returnsTheSameBookingWhenAHoldIsConvertedTwice() {
        long holdId = placeHold("10 minutes", 2);

        Booking first = bookingService.convertHold(checkout(holdId), customerId);
        Booking second = bookingService.convertHold(checkout(holdId), customerId);

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(countBookingsForHold(holdId)).isEqualTo(1);
        // A retried checkout must not double-charge the zone.
        assertThat(zoneCount("sold_qty")).isEqualTo(2);
    }

    // ------------------------------------------------------------------
    // Hold expiry mid-checkout
    // ------------------------------------------------------------------

    @Test
    void releasesInventoryWhenTheHoldExpiredDuringCheckout() {
        // ACTIVE but already past its clock - exactly the window between a
        // hold lapsing and the sweeper noticing.
        long holdId = placeHold("-1 minutes", 4);

        assertThatThrownBy(() -> bookingService.convertHold(checkout(holdId), customerId))
                .isInstanceOf(HoldExpiredException.class);

        // The release has to have survived the exception; without
        // noRollbackFor these three assertions all fail.
        assertThat(seatStatus()).isEqualTo("AVAILABLE");
        assertThat(jdbc.queryForObject("SELECT hold_id FROM event_seat WHERE id = ?", Long.class, seatId)).isNull();
        assertThat(zoneCount("held_qty")).isZero();

        assertThat(holdStatus(holdId)).isEqualTo("EXPIRED");
        assertThat(countBookingsForHold(holdId)).isZero();
    }

    @Test
    void refusesToConvertAHoldBelongingToSomeoneElse() {
        long holdId = placeHold("10 minutes", 1);
        long stranger = insertId(
                "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                        + "VALUES (?, ?, 'x', 'Stranger', 'CUSTOMER') RETURNING id",
                phone(90_000 + SEQ.get()), "stranger" + SEQ.get() + "@example.com");

        // Reported as missing rather than forbidden, so hold ids cannot be probed.
        assertThatThrownBy(() -> bookingService.convertHold(checkout(holdId), stranger))
                .isInstanceOf(com.eventbooking.inventory.error.HoldNotFoundException.class);

        assertThat(countBookingsForHold(holdId)).isZero();
        assertThat(seatStatus()).isEqualTo("HELD");
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    @Test
    void rejectsAnIllegalTransitionAndLeavesTheBookingWhereItWas() {
        long holdId = placeHold("10 minutes", 1);
        Booking booking = bookingService.convertHold(checkout(holdId), customerId);

        assertThatThrownBy(() ->
                bookingService.transition(booking.getId(), CONFIRMED, customerId, "skipping payment"))
                .isInstanceOf(IllegalBookingTransitionException.class);

        assertThat(stateOf(booking.getId())).isEqualTo("PENDING_PAYMENT");
        // The refused transition must leave no trace in the audit trail either.
        assertThat(historyToStates(booking.getId())).containsExactly("PENDING_PAYMENT");
    }

    @Test
    void auditsEveryStepOfALegalPath() {
        long holdId = placeHold("10 minutes", 1);
        Booking booking = bookingService.convertHold(checkout(holdId), customerId);

        bookingService.transition(booking.getId(), AWAITING_CONFIRMATION, customerId, "KHQR issued");
        bookingService.transition(booking.getId(), CONFIRMED, null, "bakong-ref-991");

        assertThat(historyToStates(booking.getId()))
                .containsExactly("PENDING_PAYMENT", "AWAITING_CONFIRMATION", "CONFIRMED");
        assertThat(stateOf(booking.getId())).isEqualTo("CONFIRMED");
    }

    @Test
    void treatsARepeatedTransitionAsANoOp() {
        long holdId = placeHold("10 minutes", 1);
        Booking booking = bookingService.convertHold(checkout(holdId), customerId);
        bookingService.transition(booking.getId(), AWAITING_CONFIRMATION, customerId, "KHQR issued");

        // Payment webhooks are at-least-once, so a duplicate delivery must not
        // 409 - and must not add a second history row.
        bookingService.transition(booking.getId(), AWAITING_CONFIRMATION, customerId, "duplicate webhook");

        assertThat(historyToStates(booking.getId()))
                .containsExactly("PENDING_PAYMENT", "AWAITING_CONFIRMATION");
    }

    @Test
    void cancellingReturnsInventoryAndFreesTheSeatForResale() {
        long firstHold = placeHold("10 minutes", 2);
        Booking booking = bookingService.convertHold(checkout(firstHold), customerId);

        bookingService.transition(booking.getId(), CANCELLED, customerId, "Customer changed their mind");

        assertThat(seatStatus()).isEqualTo("AVAILABLE");
        assertThat(zoneCount("sold_qty")).isZero();
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM booking_item WHERE booking_id = ? AND released_at IS NULL",
                Integer.class, booking.getId())).isZero();

        // The real regression this guards: V1's uq_booking_item_seat covered
        // every booking_item row ever written, so the cancelled booking's line
        // made this seat unsellable forever. V2 narrows it to live lines.
        long secondHold = placeHold("10 minutes", 2);
        Booking resold = bookingService.convertHold(checkout(secondHold), customerId);

        assertThat(resold.getId()).isNotEqualTo(booking.getId());
        assertThat(seatStatus()).isEqualTo("SOLD");
        assertThat(zoneCount("sold_qty")).isEqualTo(2);

        // The cancelled booking's lines survive as financial history.
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM booking_item WHERE booking_id = ?", Integer.class, booking.getId()))
                .isEqualTo(2);
    }

    @Test
    void expiresBookingsLeftUnpaidPastThePaymentWindow() {
        long holdId = placeHold("10 minutes", 3);
        Booking booking = bookingService.convertHold(checkout(holdId), customerId);

        // Backdate past the 15-minute default window rather than waiting it out.
        jdbc.update("UPDATE booking SET state_changed_at = now() - interval '1 hour' WHERE id = ?", booking.getId());

        assertThat(bookingService.expireStaleBookings()).isEqualTo(1);

        assertThat(stateOf(booking.getId())).isEqualTo("EXPIRED");
        assertThat(seatStatus()).isEqualTo("AVAILABLE");
        assertThat(zoneCount("sold_qty")).isZero();
        assertThat(historyToStates(booking.getId())).containsExactly("PENDING_PAYMENT", "EXPIRED");
    }

    @Test
    void leavesConfirmedBookingsAloneWhenSweeping() {
        long holdId = placeHold("10 minutes", 1);
        Booking booking = bookingService.convertHold(checkout(holdId), customerId);
        bookingService.transition(booking.getId(), AWAITING_CONFIRMATION, customerId, "KHQR issued");
        bookingService.transition(booking.getId(), CONFIRMED, null, "bakong-ref-991");

        jdbc.update("UPDATE booking SET state_changed_at = now() - interval '1 hour' WHERE id = ?", booking.getId());

        assertThat(bookingService.expireStaleBookings()).isZero();
        assertThat(stateOf(booking.getId())).isEqualTo("CONFIRMED");
        assertThat(seatStatus()).isEqualTo("SOLD");
    }

    // ------------------------------------------------------------------
    // Fixture helpers
    // ------------------------------------------------------------------

    /**
     * Places a hold the way the inventory lane will once SeatHoldService and
     * ZoneHoldService exist: flag the seat, add the zone line, bump held_qty.
     *
     * @param ttl a Postgres interval; pass a negative one for an expired hold
     */
    private long placeHold(String ttl, int zoneQty) {
        long holdId = insertId(
                "INSERT INTO hold (event_id, user_id, status, expires_at) "
                        + "VALUES (?, ?, 'ACTIVE', now() + interval '" + ttl + "') RETURNING id",
                eventId, customerId);

        jdbc.update("UPDATE event_seat SET status = 'HELD', hold_id = ?, "
                + "hold_expires_at = (SELECT expires_at FROM hold WHERE id = ?) WHERE id = ?",
                holdId, holdId, seatId);

        jdbc.update("INSERT INTO hold_zone_line (hold_id, event_zone_id, qty) VALUES (?, ?, ?)",
                holdId, zoneId, zoneQty);
        jdbc.update("UPDATE event_zone SET held_qty = held_qty + ? WHERE id = ?", zoneQty, zoneId);

        return holdId;
    }

    private CheckoutRequest checkout(long holdId) {
        return new CheckoutRequest(holdId, "Dara Sok", "+85512345678", "dara@example.com");
    }

    private long insertId(String sql, Object... args) {
        Long id = jdbc.queryForObject(sql, Long.class, args);
        assertThat(id).as("insert did not return an id: %s", sql).isNotNull();
        return id;
    }

    /** A distinct valid Cambodian E.164 number per seeded user. */
    private static String phone(int n) {
        return String.format("+8551%07d", n % 10_000_000);
    }

    private String seatStatus() {
        return jdbc.queryForObject("SELECT status FROM event_seat WHERE id = ?", String.class, seatId);
    }

    private int zoneCount(String column) {
        Integer value = jdbc.queryForObject(
                "SELECT " + column + " FROM event_zone WHERE id = ?", Integer.class, zoneId);
        return value == null ? 0 : value;
    }

    private String holdStatus(long holdId) {
        return jdbc.queryForObject("SELECT status FROM hold WHERE id = ?", String.class, holdId);
    }

    private String stateOf(long bookingId) {
        return jdbc.queryForObject("SELECT state FROM booking WHERE id = ?", String.class, bookingId);
    }

    private int countBookingsForHold(long holdId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM booking WHERE hold_id = ?", Integer.class, holdId);
        return count == null ? 0 : count;
    }

    private List<String> historyToStates(long bookingId) {
        return jdbc.queryForList(
                "SELECT to_state FROM booking_status_history WHERE booking_id = ? ORDER BY changed_at, id",
                String.class, bookingId);
    }
}
