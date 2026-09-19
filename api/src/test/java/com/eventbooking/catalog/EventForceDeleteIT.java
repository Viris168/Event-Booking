package com.eventbooking.catalog;

import com.eventbooking.exception.catalog.EventNotDeletableException;
import com.eventbooking.exception.catalog.EventPaidOutException;
import com.eventbooking.security.GoogleTokenVerifier;
import com.eventbooking.service.event.EventDeletionService;
import com.eventbooking.service.event.EventForceDeletionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Erasing an event that sold tickets.
 *
 * <p>Against a real Postgres, and that is the whole point of the file rather
 * than a preference. What force delete actually is, is an ordering: eleven
 * tables reference this event or its bookings and only four of them carry an
 * ON DELETE clause, so the correctness of the feature is entirely a question of
 * whether the statements run in an order Postgres will accept. Mocked
 * repositories would return 0 from every delete and pass no matter what order
 * they were called in.
 *
 * <p>The fixture is built with raw SQL, the same way BookingCheckoutIT builds
 * its own, so the rows are exactly what the migrations describe rather than
 * what the entities happen to map. That matters more here than anywhere else in
 * the suite: two of the tables this has to clear - {@code payments} and {@code
 * payment_webhook_event} - have no JPA entity at all, and a fixture built
 * through the entity graph could not create them to be forgotten.
 */
@SpringBootTest
@Testcontainers
class EventForceDeleteIT {

    @SuppressWarnings("resource")
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
        // Both guards reject application.yml's placeholder, so without these
        // the context dies before anything here runs. See BookingCheckoutIT,
        // which carries the same pair and the same warning.
        registry.add("app.ticket.signing-secret",
                () -> "force-delete-it-signing-secret-32-chars");
        registry.add("app.jwt.secret",
                () -> "force-delete-it-jwt-secret-at-least-32-chars");
    }

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired EventForceDeletionService forceDeletionService;
    @Autowired EventDeletionService deletionService;
    @Autowired JdbcTemplate jdbc;

    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

    private long adminId;
    private long customerId;
    private long organizerId;
    private long eventId;
    private long bookingId;

    /**
     * One event, sold out to one buyer, with every table that references it
     * populated.
     *
     * <p>Deliberately maximal. The failure this guards against is a table
     * nobody remembered, so a fixture that skipped the obscure ones - the gate
     * log, the ABA legacy row, the webhook receipt - would pass while the
     * feature was broken for exactly the events it was built for.
     */
    @BeforeEach
    void seedFixture() {
        int n = SEQ.incrementAndGet();

        jdbc.update("INSERT INTO province_ref (code, name_en, name_km) VALUES ('PP', 'Phnom Penh', 'PP') "
                + "ON CONFLICT (code) DO NOTHING");

        adminId = insertId(
                "INSERT INTO app_user (phone_e164, display_name, role) "
                        + "VALUES (?, 'Acting Admin', 'PLATFORM_ADMIN') RETURNING id",
                phone(n * 3));

        long organizerUserId = insertId(
                "INSERT INTO app_user (phone_e164, display_name, role) "
                        + "VALUES (?, 'Organizer', 'ORGANIZER') RETURNING id",
                phone(n * 3 + 1));

        customerId = insertId(
                "INSERT INTO app_user (phone_e164, display_name, role) "
                        + "VALUES (?, 'Dara Sok', 'CUSTOMER') RETURNING id",
                phone(n * 3 + 2));

        organizerId = insertId(
                "INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) "
                        + "VALUES (?, 'Acme', 'Acme') RETURNING id",
                organizerUserId);

        long venueId = insertId(
                "INSERT INTO venue (organizer_id, name_en, name_km, province_code, khan_district, "
                        + "sangkat_commune, street_address) "
                        + "VALUES (?, 'Diamond Island', 'Diamond Island', 'PP', 'Chamkarmon', "
                        + "'Tonle Bassac', '#1 St 371') RETURNING id",
                organizerId);

        eventId = insertId(
                "INSERT INTO event (organizer_id, venue_id, inventory_mode, slug, title_en, title_km, "
                        + "status, starts_at, doors_open_at, sales_open_at, sales_close_at) "
                        + "VALUES (?, ?, 'ZONED', ?, 'Illegal Gig', 'Illegal Gig', 'PUBLISHED', "
                        + "now() + interval '2 days', now() + interval '2 days', "
                        + "now() - interval '1 day', now() + interval '1 day') RETURNING id",
                organizerId, venueId, "illegal-gig-" + n);

        long zoneId = insertId(
                "INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity, sold_qty) "
                        + "VALUES (?, 'GA Floor', 'GA Floor', 1000, 100, 2) RETURNING id",
                eventId);

        // CONSUMED, as a hold that became a booking is. booking.hold_id is NOT
        // NULL and UNIQUE, so there is no way to have the one without the other.
        long holdId = insertId(
                "INSERT INTO hold (event_id, user_id, status, expires_at) "
                        + "VALUES (?, ?, 'CONSUMED', now() + interval '1 hour') RETURNING id",
                eventId, customerId);

        bookingId = insertId(
                "INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state, buyer_name, "
                        + "buyer_phone_e164, buyer_email, subtotal_usd_cents, total_usd_cents, "
                        + "fx_rate_khr_per_usd, total_khr, created_at, state_changed_at) "
                        + "VALUES (?, ?, ?, ?, 'CONFIRMED', 'Dara Sok', '+85512345678', "
                        + "'dara@example.com', 2000, 2000, 4100.0000, 82000, now(), now()) RETURNING id",
                "KH-FD" + String.format("%05d", n), eventId, customerId, holdId);

        long itemId = insertId(
                "INSERT INTO booking_item (booking_id, event_zone_id, qty, unit_price_usd_cents) "
                        + "VALUES (?, ?, 2, 1000) RETURNING id",
                bookingId, zoneId);

        // Two, because a zone line of qty 2 is two independently scannable
        // tickets - and one of them has been through a gate, which is what puts
        // a row in scan_log with a ticket_id as well as an event_id.
        long ticketId = insertId(
                "INSERT INTO ticket (booking_item_id, unit_seq) VALUES (?, 1) RETURNING id", itemId);
        jdbc.update("INSERT INTO ticket (booking_item_id, unit_seq) VALUES (?, 2)", itemId);
        jdbc.update("UPDATE ticket SET checked_in_at = now(), checked_in_by = ? WHERE id = ?",
                adminId, ticketId);

        jdbc.update("INSERT INTO scan_log (event_id, operator_user_id, ticket_id, booking_id, action, "
                        + "outcome, payload_fingerprint) "
                        + "VALUES (?, ?, ?, ?, 'SCAN', 'ADMITTED', 'hash-" + n + "')",
                eventId, adminId, ticketId, bookingId);

        long paymentId = insertId(
                "INSERT INTO payment_transaction (booking_id, provider, provider_ref, idempotency_key, "
                        + "currency_charged, amount_usd_cents, amount_khr, status, expires_at, "
                        + "resolved_at) VALUES (?, 'ABA_PAYWAY', ?, ?, 'KHR', 2000, 82000, 'SUCCESS', "
                        + "now() + interval '1 hour', now()) RETURNING id",
                bookingId, "REF-" + n, "IDEM-" + n);

        jdbc.update("INSERT INTO payment_webhook_event (provider, provider_event_id, "
                        + "payment_transaction_id, payload) VALUES ('ABA_PAYWAY', ?, ?, '{}'::jsonb)",
                "EVT-" + n, paymentId);

        // The ABA lane's own row. No entity maps it, which is precisely why it
        // is in this fixture.
        jdbc.update("INSERT INTO payments (tranid, created_at, payment_status, booking_id) "
                + "VALUES (?, now(), 'APPROVED', ?)", "TRAN-" + n, bookingId);

        jdbc.update("INSERT INTO booking_status_history (booking_id, from_state, to_state) "
                + "VALUES (?, 'PENDING_PAYMENT', 'CONFIRMED')", bookingId);
    }

    // ------------------------------------------------------------------
    // The guard this exists to get past
    // ------------------------------------------------------------------

    @Test
    void theOrdinaryDeleteStillRefusesAnEventWithBookings() {
        assertThatThrownBy(() -> deletionService.delete(adminId, eventId))
                .as("force delete must not have loosened the ordinary one")
                .isInstanceOf(EventNotDeletableException.class);

        assertThat(count("event", "id = " + eventId)).isOne();
    }

    // ------------------------------------------------------------------
    // The export, which is the only reason this is survivable
    // ------------------------------------------------------------------

    @Test
    void theExportNamesTheBuyerAndWhatTheyPaid() {
        EventForceDeletionService.Export export = forceDeletionService.export(eventId);

        assertThat(export.filename()).contains(String.valueOf(eventId)).endsWith(".csv");
        assertThat(export.csv())
                .as("the phone number is the whole point - it is how they get paid back")
                .contains("+85512345678")
                .contains("Dara Sok")
                .contains("dara@example.com")
                // Dollars, not cents: the next step is a refund form.
                .contains("20.00")
                .contains("SUCCESS");
    }

    @Test
    void theExportCountsTicketsRatherThanBookings() {
        // A zone line of qty 2 is two tickets on one booking, and the buyer
        // thinks they bought two.
        assertThat(forceDeletionService.export(eventId).csv().lines().toList())
                .as("a title line, a header and exactly one booking row")
                .hasSize(3);
        assertThat(forceDeletionService.export(eventId).csv()).contains(",2,20.00,");
    }

    // ------------------------------------------------------------------
    // The delete itself
    // ------------------------------------------------------------------

    @Test
    void erasesTheEventAndEverythingPointingAtIt() {
        forceDeletionService.forceDelete(adminId, eventId, "Illegal content reported by the ministry");

        assertThat(count("event", "id = " + eventId)).isZero();
        assertThat(count("booking", "event_id = " + eventId)).isZero();
        assertThat(count("event_zone", "event_id = " + eventId)).isZero();
        assertThat(count("hold", "event_id = " + eventId)).isZero();
        assertThat(count("scan_log", "event_id = " + eventId)).isZero();

        // Reached only through booking_id, so these are the ones an ordering
        // mistake leaves behind as orphans rather than as a constraint error.
        assertThat(count("booking_item", "booking_id = " + bookingId)).isZero();
        assertThat(count("payment_transaction", "booking_id = " + bookingId)).isZero();
        assertThat(count("payments", "booking_id = " + bookingId)).isZero();
        assertThat(count("booking_status_history", "booking_id = " + bookingId)).isZero();
        assertThat(count("ticket", "booking_item_id in "
                + "(select id from booking_item where booking_id = " + bookingId + ")")).isZero();
    }

    @Test
    void takesTheWebhookReceiptsWithThePaymentsTheyDescribe() {
        forceDeletionService.forceDelete(adminId, eventId, "Illegal content reported by the ministry");

        // payment_webhook_event has no entity and no cascade. Left behind it
        // would be an orphan row keyed on a provider event id, which quietly
        // makes a replayed callback look like one already processed.
        assertThat(count("payment_webhook_event", "payment_transaction_id is not null "
                + "and payment_transaction_id not in (select id from payment_transaction)"))
                .isZero();
    }

    @Test
    void leavesTheOrganizerAndTheBuyerStanding() {
        forceDeletionService.forceDelete(adminId, eventId, "Illegal content reported by the ministry");

        assertThat(count("app_user", "id = " + customerId))
                .as("the buyer did nothing wrong")
                .isOne();
        assertThat(count("organizer_profile", "id = " + organizerId))
                .as("the organisation's other events are not this event's business")
                .isOne();
    }

    // ------------------------------------------------------------------
    // The one thing it will not go through
    // ------------------------------------------------------------------

    @Test
    void refusesAnEventWhosePayoutHasAlreadyBeenPaid() {
        jdbc.update("INSERT INTO payout_request (event_id, organizer_id, invoice_no, gross_usd_cents, "
                        + "fee_bps, fee_usd_cents, net_usd_cents, tickets_sold, bookings_count, "
                        + "payout_method, account_name, account_number, "
                        + "status, reviewed_by, reviewed_at, paid_reference, paid_at) "
                        + "VALUES (?, ?, ?, 2000, 250, 50, 1950, 1, 2, 'ABA', 'Acme', '001', 'PAID', ?, now(), 'ABA-999', now())",
                eventId, organizerId, "INV-PAID-" + eventId, adminId);

        assertThatThrownBy(() ->
                forceDeletionService.forceDelete(adminId, eventId, "Illegal content reported"))
                .isInstanceOf(EventPaidOutException.class)
                .hasMessageContaining("INV-PAID-" + eventId);

        assertThat(count("event", "id = " + eventId))
                .as("and nothing was half-deleted on the way to the refusal")
                .isOne();
        assertThat(count("booking", "id = " + bookingId)).isOne();
    }

    @Test
    void erasesAnEventWhosePayoutWasOnlyRequested() {
        jdbc.update("INSERT INTO payout_request (event_id, organizer_id, invoice_no, gross_usd_cents, "
                        + "fee_bps, fee_usd_cents, net_usd_cents, tickets_sold, bookings_count, "
                        + "payout_method, account_name, account_number, "
                        + "status) VALUES (?, ?, ?, 2000, 250, 50, 1950, 1, 2, 'ABA', 'Acme', '001', 'REQUESTED')",
                eventId, organizerId, "INV-OPEN-" + eventId);

        // Nobody has been paid, so the invoice is a claim for money that never
        // moved - and it cannot outlive the event it invoices for.
        assertThatCode(() ->
                forceDeletionService.forceDelete(adminId, eventId, "Illegal content reported"))
                .doesNotThrowAnyException();

        assertThat(count("payout_request", "event_id = " + eventId)).isZero();
    }

    // ------------------------------------------------------------------

    private long insertId(String sql, Object... args) {
        Long id = jdbc.queryForObject(sql, Long.class, args);
        assertThat(id).as("insert did not return an id: %s", sql).isNotNull();
        return id;
    }

    private int count(String table, String where) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + where, Integer.class);
        return n == null ? 0 : n;
    }

    /** A distinct valid Cambodian number per seeded user; phone_e164 is UNIQUE. */
    private static String phone(int n) {
        return String.format("+8551%07d", n % 10_000_000);
    }
}
