package com.eventbooking.repository;

import com.eventbooking.Enumeration.NotificationType;
import com.eventbooking.model.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

/**
 * Data access for {@code notification}.
 *
 * <p>Every method here is scoped by recipient, including the ones that look up a
 * single row by id. That is deliberate: an inbox is the most casually-addressed
 * thing in an app - the id is right there in the URL - and a {@code findById}
 * available to the service is a {@code findById} that eventually gets called
 * with somebody else's id. Taking the recipient as a second argument makes
 * reading another person's mail unrepresentable rather than merely checked for.
 */
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /** The inbox, newest first. */
    Page<Notification> findByRecipientUserIdOrderByCreatedAtDesc(Long recipientUserId, Pageable pageable);

    /** The unread inbox, newest first - the filter the bell's dropdown opens on. */
    Page<Notification> findByRecipientUserIdAndReadAtIsNullOrderByCreatedAtDesc(
            Long recipientUserId, Pageable pageable);

    /** The badge number. Served by the partial index, so it stays cheap as history grows. */
    long countByRecipientUserIdAndReadAtIsNull(Long recipientUserId);

    /** One row, but only if it belongs to the caller. */
    Optional<Notification> findByIdAndRecipientUserId(Long id, Long recipientUserId);

    /**
     * The cheap half of the write guard.
     *
     * <p>The unique index is the guarantee; this is what keeps the common case
     * from reaching it. Payment settlement is observed repeatedly by design -
     * the PayWay poller re-reads a transaction until it stops changing - so
     * without this the ordinary path would be "insert, violate, roll back" on
     * every poll after the first, which works but leaves a trail of constraint
     * errors in the log that look like a bug and hide the ones that are.
     */
    boolean existsByRecipientUserIdAndTypeAndDedupeKey(
            Long recipientUserId, NotificationType type, String dedupeKey);

    /**
     * Mark the whole inbox read, in one statement.
     *
     * <p>{@code readAt IS NULL} in the predicate is not redundant with the badge
     * count: it keeps the write proportional to what is actually unread, and it
     * means a second click does not restamp a year of history with today's date.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Notification n
               SET n.readAt = :at
             WHERE n.recipientUserId = :recipientUserId
               AND n.readAt IS NULL
            """)
    int markAllRead(@Param("recipientUserId") Long recipientUserId, @Param("at") Instant at);
}
