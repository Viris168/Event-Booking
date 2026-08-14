package com.eventbooking.repository;

import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.model.PaymentTransaction;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {

    /** A booking's attempt history, newest first - the payment table on the pay screen. */
    List<PaymentTransaction> findByBookingIdOrderByCreatedAtDesc(Long bookingId);

    /**
     * The attempt the customer is currently looking at, if any. At most one row
     * can match: {@code startPayment} holds the booking row lock while it checks
     * for and opens attempts, so two open rows for one booking cannot be created.
     */
    Optional<PaymentTransaction> findFirstByBookingIdAndStatusInOrderByCreatedAtDesc(
            Long bookingId, Collection<PaymentStatus> statuses);

    Optional<PaymentTransaction> findByProviderRef(String providerRef);

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
            order by p.lastPolledAt asc nulls first, p.id asc
            """)
    List<Long> findOpenIds(@Param("statuses") Collection<PaymentStatus> statuses, Pageable pageable);
}
