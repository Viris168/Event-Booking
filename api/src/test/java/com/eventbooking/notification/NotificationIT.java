package com.eventbooking.notification;

import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.dto.notification.NotificationResponse;
import com.eventbooking.model.Notification;
import com.eventbooking.notification.error.NotificationNotFoundException;
import com.eventbooking.repository.NotificationRepository;
import com.eventbooking.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The inbox against a real Postgres.
 *
 * <p>Against a real one because the two things most likely to break here cannot
 * break anywhere else: the {@code params} column is {@code jsonb} mapped to a
 * {@code Map}, which compiles whatever it does at runtime, and the dedupe
 * guarantee is a partial unique index that H2 would not enforce.
 *
 * <p>Not {@code @Transactional}: {@code NotificationWriter} is REQUIRES_NEW, so
 * a test-owned transaction would be suspended around every write and the
 * assertions would be reading a different one.
 */
@SpringBootTest
@Testcontainers
class NotificationIT {

    // The chained withX() calls hand back a different reference than the
    // allocation, which reads as a leak to the compiler's resource analysis.
    // @Testcontainers owns this container's lifecycle and stops it after the class.
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
        // Both guards reject the placeholders in application.yml and would kill
        // the context before any test in this class ran. See BookingCheckoutIT.
        registry.add("app.ticket.signing-secret", () -> "notification-it-signing-secret-32-chars");
        registry.add("app.jwt.secret", () -> "notification-it-jwt-secret-at-least-32-chars");
    }

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private long customerId;

    @BeforeEach
    void seedUser() {
        int n = SEQ.incrementAndGet();
        customerId = insertUser("Customer" + n, "CUSTOMER", n);
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    @Test
    void writesAndReadsBackTheParamsAsAJsonObject() {
        notificationService.notifyUser(
                customerId,
                NotificationType.BOOKING_CONFIRMED,
                "KH-0001",
                "/bookings/7",
                Map.of("bookingRef", "KH-0001", "titleEn", "Water Festival", "totalUsdCents", 2500));

        List<Notification> rows = notificationRepository
                .findByRecipientUserIdOrderByCreatedAtDesc(customerId, page(10))
                .getContent();

        assertThat(rows).hasSize(1);
        Notification row = rows.getFirst();

        assertThat(row.getType()).isEqualTo(NotificationType.BOOKING_CONFIRMED);
        assertThat(row.getLinkUrl()).isEqualTo("/bookings/7");
        assertThat(row.getReadAt()).isNull();
        assertThat(row.getCreatedAt()).isNotNull();

        // The point of the test: the Map survived the round trip through jsonb
        // with its value types intact, rather than arriving as a JSON string.
        assertThat(row.getParams())
                .containsEntry("bookingRef", "KH-0001")
                .containsEntry("titleEn", "Water Festival")
                .containsEntry("totalUsdCents", 2500);

        // And it really is jsonb underneath, so ->> works and a later query can
        // reach inside it.
        String title = jdbc.queryForObject(
                "SELECT params->>'titleEn' FROM notification WHERE id = ?", String.class, row.getId());
        assertThat(title).isEqualTo("Water Festival");
    }

    @Test
    void acceptsANotificationWithNoParamsAndNoLink() {
        notificationService.notifyUser(
                customerId, NotificationType.BOOKING_EXPIRED, "KH-0002", null, null);

        Notification row = onlyRowFor(customerId);
        assertThat(row.getParams()).isEmpty();
        assertThat(row.getLinkUrl()).isNull();
    }

    // ------------------------------------------------------------------
    // Dedupe - the guarantee a polled payment depends on
    // ------------------------------------------------------------------

    @Test
    void writesTheSameOccurrenceOnlyOnce() {
        for (int i = 0; i < 4; i++) {
            notificationService.notifyUser(
                    customerId,
                    NotificationType.BOOKING_CONFIRMED,
                    "KH-0003",
                    "/bookings/9",
                    Map.of("bookingRef", "KH-0003"));
        }

        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(customerId)).isEqualTo(1);
    }

    @Test
    void aDifferentTypeOnTheSameKeyIsADifferentNotification() {
        notificationService.notifyUser(
                customerId, NotificationType.BOOKING_CONFIRMED, "KH-0004", null, Map.of());
        notificationService.notifyUser(
                customerId, NotificationType.BOOKING_REFUNDED, "KH-0004", null, Map.of());

        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(customerId)).isEqualTo(2);
    }

    @Test
    void oneOccurrenceReachesEveryRecipientSeparately() {
        long otherUser = insertUser("Other", "CUSTOMER", SEQ.incrementAndGet());

        // Same type, same key, two people: the unique index is scoped per
        // recipient, so both get their own row rather than one of them missing
        // out because somebody else was told first.
        notificationService.notifyUser(customerId, NotificationType.REFUND_REQUESTED, "KH-0005", null, Map.of());
        notificationService.notifyUser(otherUser, NotificationType.REFUND_REQUESTED, "KH-0005", null, Map.of());

        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(customerId)).isEqualTo(1);
        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(otherUser)).isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Reading, and who may
    // ------------------------------------------------------------------

    @Test
    void theInboxShowsOnlyWhatWasAddressedToYou() {
        long stranger = insertUser("Stranger", "CUSTOMER", SEQ.incrementAndGet());

        notificationService.notifyUser(customerId, NotificationType.BOOKING_CONFIRMED, "MINE", null, Map.of());
        notificationService.notifyUser(stranger, NotificationType.BOOKING_CONFIRMED, "THEIRS", null, Map.of());

        Page<NotificationResponse> mine = notificationService.inbox(customerId, false, 0, 20);

        assertThat(mine.getTotalElements()).isEqualTo(1);
        assertThat(mine.getContent().getFirst().params()).isEmpty();
    }

    @Test
    void markingSomebodyElsesNotificationReadIsNotFound() {
        long stranger = insertUser("Stranger", "CUSTOMER", SEQ.incrementAndGet());
        notificationService.notifyUser(stranger, NotificationType.BOOKING_CONFIRMED, "THEIRS", null, Map.of());

        Long theirId = onlyRowFor(stranger).getId();

        // 404 rather than 403: a 403 would confirm the row exists, which is more
        // than someone incrementing ids should be able to learn.
        assertThatThrownBy(() -> notificationService.markRead(customerId, theirId))
                .isInstanceOf(NotificationNotFoundException.class);

        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(stranger)).isEqualTo(1);
    }

    @Test
    void markingReadIsIdempotentAndKeepsTheFirstTimestamp() {
        notificationService.notifyUser(customerId, NotificationType.BOOKING_CONFIRMED, "KH-0006", null, Map.of());
        Long id = onlyRowFor(customerId).getId();

        NotificationResponse first = notificationService.markRead(customerId, id);
        NotificationResponse second = notificationService.markRead(customerId, id);

        assertThat(first.readAt()).isNotNull();
        assertThat(second.readAt()).isEqualTo(first.readAt());
        assertThat(notificationService.unreadCount(customerId)).isZero();
    }

    @Test
    void unreadOnlyDropsWhatHasBeenRead() {
        notificationService.notifyUser(customerId, NotificationType.BOOKING_CONFIRMED, "A", null, Map.of());
        notificationService.notifyUser(customerId, NotificationType.BOOKING_REFUNDED, "B", null, Map.of());

        Long firstId = notificationRepository
                .findByRecipientUserIdOrderByCreatedAtDesc(customerId, page(10))
                .getContent().getFirst().getId();
        notificationService.markRead(customerId, firstId);

        assertThat(notificationService.inbox(customerId, false, 0, 20).getTotalElements()).isEqualTo(2);
        assertThat(notificationService.inbox(customerId, true, 0, 20).getTotalElements()).isEqualTo(1);
    }

    @Test
    void markAllReadClearsTheBadgeAndReportsWhatItTouched() {
        notificationService.notifyUser(customerId, NotificationType.BOOKING_CONFIRMED, "A", null, Map.of());
        notificationService.notifyUser(customerId, NotificationType.BOOKING_REFUNDED, "B", null, Map.of());
        notificationService.notifyUser(customerId, NotificationType.BOOKING_EXPIRED, "C", null, Map.of());

        assertThat(notificationService.markAllRead(customerId)).isEqualTo(3);
        assertThat(notificationService.unreadCount(customerId)).isZero();

        // Second pass touches nothing rather than restamping history with today.
        assertThat(notificationService.markAllRead(customerId)).isZero();
    }

    @Test
    void requestingAnEnormousPageIsCappedRatherThanServed() {
        notificationService.notifyUser(customerId, NotificationType.BOOKING_CONFIRMED, "A", null, Map.of());

        assertThat(notificationService.inbox(customerId, false, 0, 100_000).getSize()).isEqualTo(100);
    }

    // ------------------------------------------------------------------
    // Fan-out
    // ------------------------------------------------------------------

    @Test
    void notifyAdminsReachesEveryAdminAndNobodyElse() {
        int n = SEQ.incrementAndGet();
        long adminA = insertUser("Admin A", "PLATFORM_ADMIN", n);
        long adminB = insertUser("Admin B", "PLATFORM_ADMIN", SEQ.incrementAndGet());

        notificationService.notifyAdmins(
                NotificationType.EVENT_SUBMITTED_FOR_REVIEW,
                "event:" + n,
                "/admin/review",
                Map.of("titleEn", "Bon Om Touk"));

        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(adminA)).isEqualTo(1);
        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(adminB)).isEqualTo(1);
        // The customer seeded for this test is not an admin and hears nothing.
        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(customerId)).isZero();
    }

    @Test
    void oneAdminReadingItLeavesTheOthersUnread() {
        long adminA = insertUser("Admin A", "PLATFORM_ADMIN", SEQ.incrementAndGet());
        long adminB = insertUser("Admin B", "PLATFORM_ADMIN", SEQ.incrementAndGet());

        notificationService.notifyAdmins(
                NotificationType.ORGANIZER_APPLICATION_SUBMITTED, "app:1", "/admin/applications", Map.of());

        notificationService.markAllRead(adminA);

        // The queue is still there for B until somebody actually works it.
        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(adminA)).isZero();
        assertThat(notificationRepository.countByRecipientUserIdAndReadAtIsNull(adminB)).isEqualTo(1);
    }

    @Test
    void aNullRecipientIsNothingToDoRatherThanAFailure() {
        // Machine-driven transitions can reach the writer with nobody to tell.
        notificationService.notifyUser(null, NotificationType.BOOKING_EXPIRED, "KH-0007", null, Map.of());

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM notification WHERE dedupe_key = 'KH-0007'", Long.class)).isZero();
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static org.springframework.data.domain.Pageable page(int size) {
        return org.springframework.data.domain.PageRequest.of(0, size);
    }

    private Notification onlyRowFor(long userId) {
        List<Notification> rows = notificationRepository
                .findByRecipientUserIdOrderByCreatedAtDesc(userId, page(10))
                .getContent();
        assertThat(rows).hasSize(1);
        return rows.getFirst();
    }

    private long insertUser(String name, String role, int n) {
        return jdbc.queryForObject(
                "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                        + "VALUES (?, ?, 'x', ?, ?) RETURNING id",
                Long.class,
                phone(n),
                "notif" + n + "-" + System.nanoTime() + "@example.com",
                name,
                role);
    }

    /** Unique, and valid against the +855 CHECK in V1. */
    private static String phone(int n) {
        return "+8559" + String.format("%07d", (n * 31 + 7) % 10_000_000);
    }
}
