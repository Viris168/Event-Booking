package com.eventbooking.repository;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.model.Ticket;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

import java.util.Collection;

public interface TicketRepository extends JpaRepository<Ticket, Long> {

    /**
     * How many units of a line have already been issued. Issuance reads this
     * and creates only the shortfall, so re-running it after a partial failure
     * finishes the job instead of duplicating what is already there.
     */
    int countByBookingItemId(Long bookingItemId);

    /**
     * Serialises check-in. Two turnstiles scanning the same code at once both
     * take this lock; the first stamps {@code checked_in_at}, the second reads
     * it back as already used. Doing the read-then-write without the lock is
     * exactly how a ticket gets admitted twice.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Ticket t where t.id = :id")
    Optional<Ticket> findByIdForUpdate(@Param("id") Long id);

    /** A booking's tickets, in the order a customer expects to see them. */
    @Query("""
            select t from Ticket t
            where t.bookingItem.booking.id = :bookingId
            order by t.bookingItem.id asc, t.unitSeq asc
            """)
    List<Ticket> findByBookingId(@Param("bookingId") Long bookingId);

    @Query("""
            select count(t) from Ticket t
            where t.bookingItem.booking.id = :bookingId
            """)
    long countByBookingId(@Param("bookingId") Long bookingId);

    /**
     * How many of a booking's tickets have already walked in.
     *
     * <p>Paired with {@link #countByBookingId} to answer the question a steward
     * actually has while scanning the third of a family's four codes: is anyone
     * else still coming? Without it every scan looks like a lone ticket and the
     * gate cannot tell a finished party from a half-arrived one.
     */
    @Query("""
            select count(t) from Ticket t
            where t.bookingItem.booking.id = :bookingId
              and t.checkedInAt is not null
            """)
    long countCheckedInByBookingId(@Param("bookingId") Long bookingId);

    /**
     * Checked-in tickets per event, for a whole page of events in one query.
     *
     * <p>Walks ticket -> booking_item -> booking to reach the event, because a
     * ticket knows its line item and nothing more. Counting per event in Java
     * would mean loading every ticket the organiser has ever issued.
     */
    @Query(value = """
            select b.event_id, count(*)
              from ticket t
              join booking_item bi on bi.id = t.booking_item_id
              join booking b on b.id = bi.booking_id
             where b.event_id in :eventIds
               and t.checked_in_at is not null
             group by b.event_id
            """, nativeQuery = true)
    List<Object[]> countCheckedInByEventIds(@Param("eventIds") Collection<Long> eventIds);

    /** Everyone admitted at this event, most recent first. */
    @Query("""
            select t from Ticket t
            where t.bookingItem.booking.event.id = :eventId
              and t.checkedInAt is not null
            order by t.checkedInAt desc
            """)
    org.springframework.data.domain.Page<Ticket> findCheckedInByEventId(
            @Param("eventId") Long eventId, org.springframework.data.domain.Pageable pageable);

    /** Tickets issued for an event, checked in or not. */
    @Query("""
            select count(t) from Ticket t
            where t.bookingItem.booking.event.id = :eventId
            """)
    long countByEventId(@Param("eventId") Long eventId);

    /**
     * Tickets issued for an event, restricted to bookings in these states.
     *
     * <p>The invoice's ticket count. {@link #countByEventId} is the wrong
     * number for that: it counts every ticket ever issued for the event,
     * whatever became of the booking behind it, so an invoice using it would
     * claim more tickets than the gross it sits beside was earned from.
     */
    @Query("""
            select count(t) from Ticket t
            where t.bookingItem.booking.event.id = :eventId
              and t.bookingItem.booking.state in :states
            """)
    long countByEventIdAndBookingStateIn(@Param("eventId") Long eventId,
                                         @Param("states") Collection<BookingStatus> states);

    /** ...and how many of them have walked in. */
    @Query("""
            select count(t) from Ticket t
            where t.bookingItem.booking.event.id = :eventId
              and t.checkedInAt is not null
            """)
    long countCheckedInByEventId(@Param("eventId") Long eventId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select t from Ticket t
        where t.bookingItem.booking.id = :bookingId
        order by t.bookingItem.id asc, t.unitSeq asc
        """)
    List<Ticket> findAllByBookingIdForUpdate(@Param("bookingId") Long bookingId);

    /**
     * Platform-wide check-in count. checkedInAt is the only record that a
     * ticket was scanned - Ticket.isCheckedIn() reads the same field - so its
     * nullity is the question, not a separate status column.
     */
    long countByCheckedInAtIsNotNull();

    // --- force delete ---------------------------------------------------------

    /**
     * Every ticket issued for this event, for the export.
     *
     * <p>Counted per admission unit, not per booking, which is why the export's
     * ticket column can read 3 against a single booking row: a zone line of
     * three is three independently scannable tickets.
     */
    @Query("""
            select t from Ticket t
            where t.bookingItem.booking.event.id = :eventId
            """)
    List<Ticket> findByEventId(@Param("eventId") Long eventId);

    /**
     * Void every ticket for this event.
     *
     * <p>First of the force delete's erasures, because ticket is the one table
     * that blocks the cascade the schema does declare:
     * {@code booking_item} cascades from {@code booking}, but
     * {@code ticket.booking_item_id} has no ON DELETE, so the cascade fails
     * against any booking that reached issuance. Which is all of the confirmed
     * ones.
     */
    @Modifying
    @Query("delete from Ticket t where t.bookingItem.booking.event.id = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);
}
