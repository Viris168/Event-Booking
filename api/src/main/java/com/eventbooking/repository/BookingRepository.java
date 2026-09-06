package com.eventbooking.repository;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.model.Booking;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    Optional<Booking> findByBookingRef(String bookingRef);

    /**
     * booking.hold_id is UNIQUE, so this is the idempotency probe for
     * checkout: a double-submitted "convert my hold" returns the booking the
     * first request already created instead of a 409.
     */
    Optional<Booking> findByHoldId(Long holdId);

    /**
     * Confirmed booking value per month for one organiser, aggregated in SQL.
     *
     * <p>Native rather than JPQL because date_trunc has no JPQL equivalent, and
     * doing the bucketing in Java would mean transferring every booking row to
     * add up twelve numbers - the exact thing this replaces.
     *
     * <p>Only CONFIRMED counts. A pending booking is an intention that lapses
     * when its hold expires, and a revenue chart that folded those in would
     * show money that can still evaporate.
     */
    @Query(value = """
            select extract(year  from b.created_at)::int as yr,
                   extract(month from b.created_at)::int as mo,
                   coalesce(sum(b.total_usd_cents), 0)   as cents,
                   count(*)                              as bookings
              from booking b
              join event e on e.id = b.event_id
             where e.organizer_id = :organizerId
               and b.state = 'CONFIRMED'
               and b.created_at >= :since
             group by 1, 2
             order by 1, 2
            """, nativeQuery = true)
    List<Object[]> findMonthlyRevenue(@Param("organizerId") Long organizerId,
                                      @Param("since") Instant since);

    /**
     * Every booking on an organiser's events, newest first.
     *
     * <p>Joined through event rather than filtered in Java: an organiser with
     * forty events would otherwise mean loading every booking on the platform
     * and discarding most of them, and the ownership rule would live in the
     * caller where it can be forgotten.
     *
     * <p>The optional filters are null-checked in the query so one method serves
     * the unfiltered list and every combination of the two, rather than four
     * derived methods that drift apart.
     */
    @Query("""
            select b from Booking b
             where b.event.organizerId = :organizerId
               and (:eventId is null or b.event.id = :eventId)
               and (:state is null or b.state = :state)
             order by b.createdAt desc
            """)
    Page<Booking> findForOrganizer(@Param("organizerId") Long organizerId,
                                   @Param("eventId") Long eventId,
                                   @Param("state") BookingStatus state,
                                   Pageable pageable);

    /** Backs GET /me/bookings, served by idx_booking_user_state. */
    Page<Booking> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    Page<Booking> findByUserIdAndStateOrderByCreatedAtDesc(Long userId, BookingStatus state, Pageable pageable);

    /**
     * Serialises concurrent state changes on one booking - the classic race
     * being a payment webhook confirming while the expiry sweeper cancels.
     * Both paths must take this lock before calling BookingStateMachine.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Booking b where b.id = :id")
    Optional<Booking> findByIdForUpdate(@Param("id") Long id);

    /**
     * Bookings that have sat unpaid past the cutoff. Drives the sweeper that
     * expires abandoned checkouts and hands the inventory back.
     */
    @Query("""
            select b from Booking b
            where b.state in :states
              and b.stateChangedAt < :cutoff
            """)
    List<Booking> findStaleInStates(
            @Param("states") List<BookingStatus> states,
            @Param("cutoff") Instant cutoff);
}
