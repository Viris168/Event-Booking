package com.eventbooking.repository;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.model.PayoutRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PayoutRequestRepository extends JpaRepository<PayoutRequest, Long> {

    /** The organiser's own history, newest first. Every status. */
    List<PayoutRequest> findByOrganizerIdOrderByRequestedAtDesc(Long organizerId);

    /** The same, narrowed to one status - the organiser's own tabs. */
    List<PayoutRequest> findByOrganizerIdAndStatusOrderByRequestedAtDesc(Long organizerId,
                                                                        PayoutStatus status);

    /**
     * The admin queue: longest wait first, so the oldest request is the one at
     * the top rather than the newest. Opposite order to the organiser's list
     * above, and deliberately - one is a queue to work down, the other is a
     * history to read.
     */
    List<PayoutRequest> findByStatusOrderByRequestedAtAsc(PayoutStatus status);

    /**
     * Whether this event has been claimed at all.
     *
     * <p>Mirrors {@code uq_payout_request_event}: one row per event for all
     * time, in any status. Checking here as well as in the index is what turns
     * a second request into a 409 the organiser can read instead of a raw 23505
     * and a 500.
     */
    Optional<PayoutRequest> findFirstByEventId(Long eventId);

    /**
     * Which of these events are already spoken for, in one query.
     *
     * <p>The "what can I claim" screen asks about every finished event the
     * organiser owns at once; asking per event would be one round trip per card
     * on the page.
     */
    @Query("select p.eventId from PayoutRequest p where p.organizerId = :organizerId")
    List<Long> findClaimedEventIds(@Param("organizerId") Long organizerId);

    /** How many sit in each status - the numbers on the admin tabs. */
    @Query("select p.status, count(p) from PayoutRequest p group by p.status")
    List<Object[]> countByStatus();

    /**
     * The next invoice number, straight off the sequence.
     *
     * <p>Native because {@code nextval} is Postgres', not JPQL's. A sequence
     * rather than {@code max(invoice_no) + 1} because two organisers clicking
     * at the same moment would read the same maximum and collide on the UNIQUE
     * constraint; nextval is outside transaction control, which is what makes
     * it safe and also why gaps appear when a request rolls back. Every invoice
     * sequence behaves this way, and a gap is far preferable to a duplicate.
     */
    @Query(value = "select nextval('payout_invoice_seq')", nativeQuery = true)
    long nextInvoiceSequence();

    /** Admin totals: how much money is sitting in a given set of states. */
    @Query("""
            select coalesce(sum(p.netUsdCents), 0) from PayoutRequest p
            where p.status in :states
            """)
    long sumNetUsdCentsByStatusIn(@Param("states") Collection<PayoutStatus> states);
}
