package com.eventbooking.security;

import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.AdminUserResponse;
import com.eventbooking.exception.security.LastAdminException;
import com.eventbooking.exception.security.UserNotDeletableException;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.service.admin.AdminUserService;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Removing a person from the platform, by the two routes that exist.
 *
 * <p>They are two because the schema makes them two. {@code app_user} is
 * referenced by fourteen columns, most with no ON DELETE clause, and the rows
 * on the other end are not all the account's own business: a booking is also
 * the organiser's sales figure, a gate scan is also the event's attendance
 * record. So deleting the row is possible only for an account that never did
 * anything, and anonymising is what serves every other case.
 *
 * <p>Against a real Postgres, because the interesting half is which foreign
 * keys actually fire. AdminUserService asks eleven counting sub-queries before
 * it deletes anything, and mocked repositories would answer zero to all of them
 * whether or not the SQL parses.
 */
@SpringBootTest
@Testcontainers
class UserDeletionIT {

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
        registry.add("app.ticket.signing-secret", () -> "user-deletion-it-signing-secret-32ch");
        registry.add("app.jwt.secret", () -> "user-deletion-it-jwt-secret-at-least-32");
    }

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired AdminUserService adminUserService;
    @Autowired AppUserRepository appUserRepository;
    @Autowired JdbcTemplate jdbc;

    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

    // ------------------------------------------------------------------
    // Delete: the narrow path
    // ------------------------------------------------------------------

    @Test
    void deletesAnAccountThatNeverDidAnything() {
        long admin = anAdmin();
        long spam = aCustomer("Spam Signup");

        adminUserService.delete(admin, spam);

        assertThat(appUserRepository.findById(spam))
                .as("the spam signup is what this path exists for")
                .isEmpty();
    }

    @Test
    void takesTheSessionsAndTheInboxWithIt() {
        long admin = anAdmin();
        long spam = aCustomer("Spam Signup");

        jdbc.update("INSERT INTO refresh_token (user_id, token_hash, expires_at) "
                + "VALUES (?, ?, now() + interval '7 days')", spam, "hash-" + spam);
        jdbc.update("INSERT INTO notification (recipient_user_id, type, dedupe_key, params) "
                + "VALUES (?, 'BOOKING_CONFIRMED', ?, '{}'::jsonb)", spam, "key-" + spam);

        adminUserService.delete(admin, spam);

        // Both cascade in the database. Asserted rather than assumed, because
        // a cascade that is not there fails the delete outright and the
        // difference only shows against a real Postgres.
        assertThat(count("refresh_token", "user_id = " + spam)).isZero();
        assertThat(count("notification", "recipient_user_id = " + spam)).isZero();
    }

    @Test
    void refusesAnAccountWithABookingAndSaysWhatIsHoldingIt() {
        long admin = anAdmin();
        long customer = aCustomerWhoBooked();

        assertThatThrownBy(() -> adminUserService.delete(admin, customer))
                .isInstanceOf(UserNotDeletableException.class)
                .hasMessageContaining("1 booking")
                // The refusal has to name the way out, or the admin goes
                // looking for SQL.
                .hasMessageContaining("Anonymize");

        assertThat(appUserRepository.findById(customer)).isPresent();
    }

    @Test
    void refusesAnAdminDeletingTheirOwnAccount() {
        long admin = anAdmin();

        assertThatThrownBy(() -> adminUserService.delete(admin, admin))
                .as("the one click that cannot be undone through the API")
                .isInstanceOf(LastAdminException.class);
    }

    @Test
    void takesADormantOrganizerProfileWithIt() {
        long admin = anAdmin();
        long user = aCustomer("Promoted By Mistake");
        // A promotion that was never used: the profile exists and owns nothing.
        // organizer_profile.user_id has no ON DELETE, so without the service
        // removing it first this account would be permanently undeletable.
        jdbc.update("INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) "
                + "VALUES (?, 'Never Used', 'Never Used')", user);

        adminUserService.delete(admin, user);

        assertThat(count("organizer_profile", "user_id = " + user)).isZero();
    }

    @Test
    void refusesAnOrganizerWhoOwnsAnEvent() {
        long admin = anAdmin();
        long organizerUser = anOrganizerWithAnEvent();

        assertThatThrownBy(() -> adminUserService.delete(admin, organizerUser))
                .isInstanceOf(UserNotDeletableException.class)
                .hasMessageContaining("event they organize");
    }

    // ------------------------------------------------------------------
    // What the screen is told, so it can hide the button
    // ------------------------------------------------------------------

    @Test
    void marksAnOrganizerWhoOwnsAnEventAsNotDeletableEvenWithNoBookings() {
        long organizerUser = anOrganizerWithAnEvent();

        AdminUserResponse row = onlyRow(organizerUser);

        assertThat(row.bookingCount())
                .as("they have bought nothing, so a booking count says removable")
                .isZero();
        assertThat(row.deletable())
                .as("but event.organizer_id points at them, and the server would refuse")
                .isFalse();
    }

    @Test
    void marksACustomerWithABookingAsNotDeletable() {
        assertThat(onlyRow(aCustomerWhoBooked()).deletable()).isFalse();
    }

    @Test
    void marksAFreshSignupAsDeletable() {
        assertThat(onlyRow(aCustomer("Spam Signup")).deletable()).isTrue();
    }

    /** The one row the list returns for this account, by its unique phone. */
    private AdminUserResponse onlyRow(long userId) {
        String phone = jdbc.queryForObject(
                "SELECT phone_e164 FROM app_user WHERE id = ?", String.class, userId);
        return adminUserService.list(phone, null, null).stream()
                .filter(u -> u.id().equals(userId))
                .findFirst()
                .orElseThrow();
    }

    // ------------------------------------------------------------------
    // Anonymize: the path for everybody else
    // ------------------------------------------------------------------

    @Test
    void anonymizeClearsTheIdentifyingColumnsAndLocksTheAccount() {
        long admin = anAdmin();
        long customer = aCustomerWhoBooked();

        AdminUserResponse after = adminUserService.anonymize(admin, customer);

        assertThat(after.phoneE164()).isNull();
        assertThat(after.email()).isNull();
        assertThat(after.displayName()).isEqualTo("Deleted user " + customer);
        assertThat(after.disabled()).isTrue();
        assertThat(jdbc.queryForObject(
                "SELECT password_hash FROM app_user WHERE id = ?", String.class, customer))
                .as("the credential is identifying in its own right")
                .isNull();
    }

    @Test
    void anonymizeKeepsTheBookingAndTheTicketItProves() {
        long admin = anAdmin();
        long customer = aCustomerWhoBooked();

        adminUserService.anonymize(admin, customer);

        assertThat(count("booking", "user_id = " + customer))
                .as("the booking is the organiser's sale too")
                .isOne();
        // booking carries its own snapshot of the buyer, taken at checkout, so
        // an anonymised account does not blank a ticket somebody is carrying to
        // a gate tomorrow.
        assertThat(jdbc.queryForObject(
                "SELECT buyer_phone_e164 FROM booking WHERE user_id = ?", String.class, customer))
                .isEqualTo("+85512345678");
    }

    @Test
    void twoAnonymizedAccountsDoNotCollide() {
        long admin = anAdmin();
        long first = aCustomerWhoBooked();
        long second = aCustomerWhoBooked();

        adminUserService.anonymize(admin, first);

        // phone_e164 and email are both UNIQUE. Clearing them to a placeholder
        // string rather than NULL would make this second call a 23505, and the
        // platform would get exactly one anonymisation ever.
        adminUserService.anonymize(admin, second);

        assertThat(count("app_user", "id in (" + first + ", " + second + ") and phone_e164 is null"))
                .isEqualTo(2);
    }

    @Test
    void anonymizeRevokesTheirSessions() {
        long admin = anAdmin();
        long customer = aCustomerWhoBooked();
        jdbc.update("INSERT INTO refresh_token (user_id, token_hash, expires_at) "
                + "VALUES (?, ?, now() + interval '7 days')", customer, "hash-a-" + customer);

        adminUserService.anonymize(admin, customer);

        // Without this the account has no way to sign in but a live session
        // keeps working until it expires.
        assertThat(count("refresh_token", "user_id = " + customer + " AND revoked_at IS NULL"))
                .isZero();
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    /** An admin to act as. Both actions refuse the caller's own row. */
    private long anAdmin() {
        return insertId("INSERT INTO app_user (phone_e164, display_name, role) "
                + "VALUES (?, 'Acting Admin', 'PLATFORM_ADMIN') RETURNING id", nextPhone());
    }

    private long aCustomer(String name) {
        return insertId("INSERT INTO app_user (phone_e164, display_name, role, password_hash) "
                + "VALUES (?, ?, 'CUSTOMER', 'x') RETURNING id", nextPhone(), name);
    }

    /** A real customer: one confirmed booking on somebody's event. */
    private long aCustomerWhoBooked() {
        long customer = aCustomer("Dara Sok");
        long eventId = anEvent();

        long holdId = insertId("INSERT INTO hold (event_id, user_id, status, expires_at) "
                        + "VALUES (?, ?, 'CONSUMED', now() + interval '1 hour') RETURNING id",
                eventId, customer);

        insertId("INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state, buyer_name, "
                        + "buyer_phone_e164, subtotal_usd_cents, total_usd_cents, fx_rate_khr_per_usd, "
                        + "total_khr, created_at, state_changed_at) "
                        + "VALUES (?, ?, ?, ?, 'CONFIRMED', 'Dara Sok', '+85512345678', 1000, 1000, "
                        + "4100.0000, 41000, now(), now()) RETURNING id",
                "KH-UD" + String.format("%05d", SEQ.get()), eventId, customer, holdId);

        return customer;
    }

    private long anOrganizerWithAnEvent() {
        long user = insertId("INSERT INTO app_user (phone_e164, display_name, role) "
                + "VALUES (?, 'Organizer', 'ORGANIZER') RETURNING id", nextPhone());
        anEventFor(profileFor(user));
        return user;
    }

    /** An event owned by a throwaway organiser, for bookings to point at. */
    private long anEvent() {
        long organizerUser = insertId("INSERT INTO app_user (phone_e164, display_name, role) "
                + "VALUES (?, 'Organizer', 'ORGANIZER') RETURNING id", nextPhone());
        return anEventFor(profileFor(organizerUser));
    }

    private long profileFor(long userId) {
        return insertId("INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) "
                + "VALUES (?, 'Acme', 'Acme') RETURNING id", userId);
    }

    private long anEventFor(long organizerId) {
        jdbc.update("INSERT INTO province_ref (code, name_en, name_km) "
                + "VALUES ('PP', 'Phnom Penh', 'PP') ON CONFLICT (code) DO NOTHING");

        long venueId = insertId("INSERT INTO venue (organizer_id, name_en, name_km, province_code, "
                        + "khan_district, sangkat_commune, street_address) "
                        + "VALUES (?, 'Hall', 'Hall', 'PP', 'Chamkarmon', 'Tonle Bassac', '#1') RETURNING id",
                organizerId);

        return insertId("INSERT INTO event (organizer_id, venue_id, inventory_mode, slug, title_en, "
                        + "title_km, status, starts_at, doors_open_at, sales_open_at, sales_close_at) "
                        + "VALUES (?, ?, 'ZONED', ?, 'Gig', 'Gig', 'PUBLISHED', "
                        + "now() + interval '2 days', now() + interval '2 days', "
                        + "now() - interval '1 day', now() + interval '1 day') RETURNING id",
                organizerId, venueId, "gig-" + SEQ.incrementAndGet());
    }

    private long insertId(String sql, Object... args) {
        Long id = jdbc.queryForObject(sql, Long.class, args);
        assertThat(id).as("insert did not return an id: %s", sql).isNotNull();
        return id;
    }

    private int count(String table, String where) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + where, Integer.class);
        return n == null ? 0 : n;
    }

    /** phone_e164 is UNIQUE and these tests share a database. */
    private String nextPhone() {
        return String.format("+8551%07d", SEQ.incrementAndGet());
    }
}
