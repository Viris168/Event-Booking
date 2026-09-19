package com.eventbooking.repository;

import com.eventbooking.Enumeration.ContactMessageStatus;
import com.eventbooking.model.ContactMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;

public interface ContactMessageRepository extends JpaRepository<ContactMessage, Long> {

    /**
     * The inbox, filtered to one status, newest first.
     *
     * <p>Paged rather than a bare list, unlike the organiser application queue.
     * That queue is bounded by how many people want to run events; this one is
     * bounded by how many strangers decide to type something, which is not a
     * number this code gets to choose.
     *
     * <p>Backed by {@code idx_contact_message_received}, and by
     * {@code idx_contact_message_open} for the NEW and OPEN cases the queue
     * actually spends its time on.
     */
    Page<ContactMessage> findByStatusOrderByReceivedAtDesc(ContactMessageStatus status, Pageable pageable);

    /** The same inbox with no status filter - everything, newest first. */
    Page<ContactMessage> findAllByOrderByReceivedAtDesc(Pageable pageable);

    /**
     * How many messages sit in each status, in one pass.
     *
     * <p>Backs the inbox's status tabs, which show every count at once. Four
     * {@code countByStatus} calls per refresh would be four round trips for
     * four integers, on a screen an admin leaves open.
     *
     * <p>{@code [status, count]} per row, and only for statuses that have any.
     * The caller fills the zeros, rather than the query inventing a row for a
     * status nothing is in - the same contract
     * {@link OrganizerApplicationRepository#countGroupedByStatus()} uses.
     */
    @Query("select m.status, count(m) from ContactMessage m group by m.status")
    List<Object[]> countGroupedByStatus();

    /**
     * How many messages this address has sent since a given moment.
     *
     * <p>The persistent half of the abuse limit.
     * {@code ContactRateLimiter} counts per IP in memory, which is the right
     * shape for a flood but forgets everything on restart and can be walked
     * around with a new address. This counts what a single reply-to has
     * actually filed, which is the part that survives both.
     *
     * <p>Lower-cased on both sides: the limit has to mean the same thing for
     * {@code Sokha@example.com} as for {@code sokha@example.com}, which are the
     * same mailbox and, without this, two separate allowances.
     */
    @Query("""
            select count(m) from ContactMessage m
            where lower(m.replyTo) = lower(:replyTo)
              and m.receivedAt >= :since
            """)
    long countRecentByReplyTo(String replyTo, Instant since);
}
