package com.eventbooking.repository;

import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.model.PaymentTransaction;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {

    /** A booking's attempt history, newest first - the payment table on the pay screen. */
    List<PaymentTransaction> findByBookingIdOrderByCreatedAtDesc(Long bookingId);

    /**
     * The payment attempts for a whole page of bookings, newest first.
     *
     * <p>Exists to avoid the N+1 that findByBookingIdOrderByCreatedAtDesc would
     * cause on a transactions table: twenty-five rows on screen would be
     * twenty-five round trips just to print the provider name in one column.
     *
     * <p>Returns rows rather than entities because the caller wants two columns
     * out of fifteen, and hydrating full PaymentTransaction objects to read the
     * provider would be most of the cost this method exists to avoid.
     */
    @Query("""
            select p.booking.id, p.provider
              from PaymentTransaction p
             where p.booking.id in :bookingIds
             order by p.createdAt desc
            """)
    List<Object[]> findProviderByBookingIds(@Param("bookingIds") Collection<Long> bookingIds);

    /**
     * The attempt the customer is currently looking at, if any. At most one row
     * can match: {@code startPayment} holds the booking row lock while it checks
     * for and opens attempts, so two open rows for one booking cannot be created.
     */
    Optional<PaymentTransaction> findFirstByBookingIdAndStatusInOrderByCreatedAtDesc(
            Long bookingId, Collection<PaymentStatus> statuses);

    Optional<PaymentTransaction> findByProviderRef(String providerRef);

    Optional<PaymentTransaction> findByProviderAndProviderRef(
            com.eventbooking.Enumeration.PaymentProvider provider, String providerRef);

    /** Defence in depth behind the booking's own CONFIRMED state: a booking with
     *  a SUCCESS row must never be handed a second QR. */
    boolean existsByBookingIdAndStatus(Long bookingId, PaymentStatus status);

    /** Numbers the attempts in a booking's idempotency keys. Read under the
     *  booking row lock, so it cannot be stale by the time it is used. */
    long countByBookingId(Long bookingId);

    /**
     * The owning booking's id as a scalar, without loading the payment entity.
     *
     * <p>That matters: {@code applyProviderResult} has to lock the booking
     * before the payment, and loading the payment first would put it in the
     * persistence context, where the subsequent locking query would return the
     * cached copy rather than re-reading the row it just locked.
     */
    @Query("select p.booking.id from PaymentTransaction p where p.id = :id")
    Optional<Long> findBookingIdOf(@Param("id") Long paymentId);

    /**
     * Serialises settlement of one attempt. The poller takes this before
     * applying a provider result, then takes the booking's lock - always in
     * that order, so it cannot deadlock against {@code startPayment}, which
     * holds the booking lock and only ever reads payment rows.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentTransaction p where p.id = :id")
    Optional<PaymentTransaction> findByIdForUpdate(@Param("id") Long id);

    /**
     * The poller's work queue: open attempts, least recently checked first, so
     * a backlog is worked fairly instead of the same few rows being re-polled.
     * Served by idx_payment_txn_open_poll.
     *
     * <p>Ids only, deliberately - each one is then locked and settled in its own
     * transaction, so one provider timeout cannot roll back the whole sweep.
     */
    @Query("""
            select p.id from PaymentTransaction p
            where p.status in :statuses
              and (p.expiresAt is null or p.expiresAt > :now)
            order by p.lastPolledAt asc nulls first, p.id asc
            """)
    List<Long> findOpenIds(@Param("statuses") Collection<PaymentStatus> statuses,
                           @Param("now") Instant now,
                           Pageable pageable);

    /**
     * Open attempts whose own clock has run out.
     *
     * <p>These are closed <b>without</b> asking the provider. The deadline is
     * ours, not theirs: a QR past {@code expires_at} cannot be paid whatever
     * Bakong says, so a round trip to confirm it would spend a request to learn
     * something already known.
     *
     * <p>That is not a micro-optimisation on a Bakong account capped at 100
     * requests a day. Before this, every lapsed QR cost one call to close - and
     * if the provider answered UNAVAILABLE it stayed open and was charged
     * again on the next sweep, every sweep, until it replied.
     */
    @Query("""
            select p.id from PaymentTransaction p
            where p.status in :statuses
              and p.expiresAt is not null
              and p.expiresAt <= :now
            order by p.expiresAt asc
            """)
    List<Long> findLapsedOpenIds(@Param("statuses") Collection<PaymentStatus> statuses,
                                 @Param("now") Instant now,
                                 Pageable pageable);

    // --- admin ---------------------------------------------------------------

    /**
     * The admin payments table. Every filter is nullable, meaning "do not
     * filter on this", so one query serves each combination of the controls
     * above the table.
     *
     * <p>booking and event are fetched with it because every row prints a
     * booking reference and an event title. Left as lazy proxies they would be
     * resolved one at a time during serialisation - the same N+1, just harder
     * to see in a profiler.
     *
     * <p>The "stuck" filter is deliberately not here: it compares createdAt to
     * a cutoff the service computes from the clock, and a repository that took
     * a cutoff parameter would still leave the threshold's definition split
     * across two files.
     */
    @Query("""
            select p from PaymentTransaction p
            join fetch p.booking b
            join fetch b.event e
            where (:provider is null or p.provider = :provider)
              and (:status is null or p.status = :status)
              and (:eventId is null or e.id = :eventId)
            order by p.createdAt desc
            """)
    List<PaymentTransaction> findForAdmin(@Param("provider") PaymentProvider provider,
                                          @Param("status") PaymentStatus status,
                                          @Param("eventId") Long eventId);

    /**
     * One attempt, with its booking and event already attached.
     *
     * <p>Not findById: the admin row prints a booking reference and an event
     * title, and both associations are lazy. The caller maps the row AFTER the
     * reconcile round trip has finished and its transaction has closed, so a
     * lazy proxy there is a LazyInitializationException rather than a title.
     */
    @Query("""
            select p from PaymentTransaction p
            join fetch p.booking b
            join fetch b.event
            where p.id = :id
            """)
    Optional<PaymentTransaction> findForAdminById(@Param("id") Long id);

    /**
     * Attempts per event per status - what the payment-health panel is built
     * from.
     *
     * <p>Returns {@code [eventId, titleEn, titleKm, status, count, usdCents]},
     * one row per status an event actually has, so the caller folds at most six
     * rows into each event rather than reading a fixed shape.
     *
     * <p>Grouped in SQL rather than counted over the list the table already
     * loads, and the difference is the whole point: the table shows one page of
     * a filtered view, while the question here is "which event is failing to
     * collect", which cannot be answered from any single event's rows.
     *
     * <p>Plain joins, not fetch joins: nothing here loads an entity, and the
     * three event columns are selected precisely so the caller does not have to
     * go back for a title per row.
     */
    @Query("""
            select e.id, e.titleEn, e.titleKm, p.status, count(p),
                   coalesce(sum(p.amountUsdCents), 0)
            from PaymentTransaction p
            join p.booking b
            join b.event e
            group by e.id, e.titleEn, e.titleKm, p.status
            """)
    List<Object[]> countByEventAndStatus();

    /** Open attempts older than the cutoff - the dashboard's stuck counter. */
    long countByStatusInAndCreatedAtLessThanEqual(Collection<PaymentStatus> statuses, Instant cutoff);

    // --- force delete ---------------------------------------------------------

    /**
     * Every payment attempt against this event, oldest first.
     *
     * <p>The part of the export that actually matters for paying people back:
     * a booking row says what was owed, this says what was taken and by which
     * provider reference. An admin chasing a refund through ABA has nothing to
     * quote them without it.
     */
    @Query("""
            select p from PaymentTransaction p
            where p.booking.event.id = :eventId
            order by p.createdAt asc
            """)
    List<PaymentTransaction> findByEventId(@Param("eventId") Long eventId);

    /**
     * Drop the webhook receipts for this event's payments.
     *
     * <p>Native because {@code payment_webhook_event} has no entity - nothing
     * in the application reads it, it exists so a replayed provider callback
     * can be recognised as one. Runs before the transactions it references,
     * which have no ON DELETE clause to do it for us.
     */
    @Modifying
    @Query(value = """
            delete from payment_webhook_event w
             where w.payment_transaction_id in (
                   select p.id from payment_transaction p
                     join booking b on b.id = p.booking_id
                    where b.event_id = :eventId)
            """, nativeQuery = true)
    int deleteWebhookEventsByEventId(@Param("eventId") Long eventId);

    /**
     * Erase this event's payment transactions.
     *
     * <p>Worth knowing what goes with them:
     * {@code uq_payment_txn_one_success_per_booking} is what stops one booking
     * being paid twice, and it is an index over these rows. Once they are gone
     * a late provider callback has nothing to collide with - which is harmless
     * only because the booking it would look for is gone in the same
     * transaction, so PaymentService rejects it as unknown rather than applying
     * it to nothing. That is the reason bookings and payments must never be
     * erased in separate transactions.
     */
    @Modifying
    @Query("delete from PaymentTransaction p where p.booking.event.id = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);

    /**
     * The ABA lane's own record of the same payments.
     *
     * <p>Native for the same reason as the webhook table: {@code payments} is
     * the PayWay integration's legacy row and has no entity. V10 gave it a
     * {@code booking_id} with no ON DELETE, so it holds the booking down just
     * as firmly as payment_transaction does, and it is easy to miss precisely
     * because no Java code maps it.
     */
    @Modifying
    @Query(value = """
            delete from payments p
             where p.booking_id in (select b.id from booking b where b.event_id = :eventId)
            """, nativeQuery = true)
    int deleteAbaPaymentsByEventId(@Param("eventId") Long eventId);
}
