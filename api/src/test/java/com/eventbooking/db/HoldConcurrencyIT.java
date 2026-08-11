package com.eventbooking.db;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Proves, at the database level, that uq_hold_one_active_per_user_event
 * (V1__schema.sql, [FIX 3]) actually prevents a user from racing two
 * concurrent requests into two active holds on the same event.
 *
 * This talks to raw JDBC on purpose: there's no BookingService/HoldService
 * yet, so this is a guard-rail test on the migration itself, not on
 * application code. Once a HoldService exists, add a companion test that
 * goes through it and asserts it turns the 23505 unique violation into a
 * 409 HOLD_ALREADY_ACTIVE response instead of leaking a raw SQL error.
 *
 * Runs against a real Postgres in Docker (Testcontainers) because H2 can't
 * execute plpgsql triggers or partial unique indexes, so it would silently
 * pass this test even if the guard were broken.
 */
@Testcontainers
class HoldConcurrencyIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("event_booking_test")
                    .withUsername("test")
                    .withPassword("test");

    private static Long eventId;
    private static Long userId;

    @BeforeAll
    static void migrateAndSeed() throws SQLException {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load()
                .migrate();

        try (Connection c = newConnection()) {
            c.setAutoCommit(true);

            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO province_ref (code, name_en, name_km) VALUES ('PP', 'Phnom Penh', 'ភ្នំពេញ')")) {
                ps.executeUpdate();
            }

            long organizerUserId = insertReturningId(c,
                    "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) " +
                            "VALUES ('+85512345678', 'organizer@example.com', 'x', 'Organizer', 'ORGANIZER') RETURNING id");

            long organizerProfileId = insertReturningId(c,
                    "INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) " +
                            "VALUES (" + organizerUserId + ", 'Acme Events', 'អាកមេ') RETURNING id");

            long venueId = insertReturningId(c,
                    "INSERT INTO venue (organizer_id, name_en, name_km, province_code, khan_district, sangkat_commune, street_address) " +
                            "VALUES (" + organizerProfileId + ", 'Diamond Island', 'កោះពេជ្រ', 'PP', 'Chamkarmon', 'Tonle Bassac', '#1 St 371') RETURNING id");

            eventId = insertReturningId(c,
                    "INSERT INTO event (organizer_id, venue_id, inventory_mode, slug, title_en, title_km, " +
                            "starts_at, doors_open_at, sales_open_at, sales_close_at) " +
                            "VALUES (" + organizerProfileId + ", " + venueId + ", 'ZONED', 'test-event', 'Test Event', 'ព្រឹត្តិការណ៍សាកល្បង', " +
                            "now() + interval '2 days', now() + interval '2 days', now() - interval '1 day', now() + interval '1 day') RETURNING id");

            userId = insertReturningId(c,
                    "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) " +
                            "VALUES ('+85587654321', 'customer@example.com', 'x', 'Customer', 'CUSTOMER') RETURNING id");
        }
    }

    @Test
    void onlyOneOfTwoConcurrentHoldsSucceeds() throws Exception {
        int attempts = 2;
        CountDownLatch ready = new CountDownLatch(attempts);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        AtomicInteger succeeded = new AtomicInteger();
        AtomicInteger uniqueViolations = new AtomicInteger();

        for (int i = 0; i < attempts; i++) {
            pool.submit(() -> {
                try (Connection c = newConnection();
                     PreparedStatement ps = c.prepareStatement(
                             "INSERT INTO hold (event_id, user_id, status, expires_at) " +
                                     "VALUES (?, ?, 'ACTIVE', now() + interval '10 minutes')")) {
                    ps.setLong(1, eventId);
                    ps.setLong(2, userId);

                    ready.countDown();
                    go.await();

                    ps.executeUpdate();
                    succeeded.incrementAndGet();
                } catch (SQLException e) {
                    if ("23505".equals(e.getSQLState())) {
                        uniqueViolations.incrementAndGet();
                    } else {
                        throw new RuntimeException(e);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return null;
            });
        }

        ready.await();
        go.countDown();
        pool.shutdown();
        assertEquals(true, pool.awaitTermination(30, TimeUnit.SECONDS), "workers did not finish in time");

        // The whole point of uq_hold_one_active_per_user_event: exactly one
        // of the two racing inserts wins, the other is rejected by Postgres
        // itself, not by application-level locking that a bug could skip.
        assertEquals(1, succeeded.get(), "expected exactly one hold to be created");
        assertEquals(1, uniqueViolations.get(), "expected exactly one unique violation");
    }

    private static Connection newConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static long insertReturningId(Connection c, String sql) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getLong(1);
        }
    }
}
