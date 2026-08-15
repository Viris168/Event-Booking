package com.eventbooking.repository;

import com.eventbooking.model.Ticket;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

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
}
