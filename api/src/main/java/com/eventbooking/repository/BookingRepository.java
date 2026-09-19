package com.eventbooking.repository;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.model.Booking;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
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
     * the unfiltered list and every combination of them, rather than a derived
     * method per combination, all drifting apart.
     *
     * <p><b>The provider filter matches the most recent attempt only</b>, which
     * is deliberate: {@code OrganizerTransactionResponse.paymentProvider} is
     * the latest attempt's provider, so that is the value the row displays. A
     * plain {@code exists} would also return a booking that was first tried on
     * Bakong and settled on ABA - it would appear under the Bakong filter with
     * "ABA PayWay" printed in its own column, and the filter would look broken
     * to the one person who noticed.
     */
    @Query("""
            select b from Booking b
             where b.event.organizerId = :organizerId
               and (:eventId is null or b.event.id = :eventId)
               and (:state is null or b.state = :state)
               and (:provider is null or exists (
                     select 1 from PaymentTransaction pt
                      where pt.booking = b
                        and pt.provider = :provider
                        and pt.createdAt = (select max(pt2.createdAt)
                                              from PaymentTransaction pt2
                                             where pt2.booking = b)))
             order by b.createdAt desc
            """)
    Page<Booking> findForOrganizer(@Param("organizerId") Long organizerId,
                                   @Param("eventId") Long eventId,
                                   @Param("state") BookingStatus state,
                                   @Param("provider") PaymentProvider provider,
                                   Pageable pageable);

    /**
     * The totals under the organiser's transactions heading, for the SAME
     * filtered set {@link #findForOrganizer} pages through.
     *
     * <p>Its own query rather than a sum over the page, which is what the screen
     * used to do: paging moved to the server and the heading kept counting
     * {@code rows.length}, so an organiser with six hundred transactions read
     * "25 transactions" above a table that had six hundred.
     *
     * <p><b>The where clause is a copy of findForOrganizer's and has to stay
     * one.</b> Two filters that disagree would put a total over a table it does
     * not describe - the exact bug this replaces, in a form that is harder to
     * see. Any change to one belongs in the other in the same edit.
     */
    @Query("""
            select count(b) as txCount,
                   coalesce(sum(case when b.state in :earning then b.totalUsdCents else 0 end), 0)
                       as settledUsdCents
              from Booking b
             where b.event.organizerId = :organizerId
               and (:eventId is null or b.event.id = :eventId)
               and (:state is null or b.state = :state)
               and (:provider is null or exists (
                     select 1 from PaymentTransaction pt
                      where pt.booking = b
                        and pt.provider = :provider
                        and pt.createdAt = (select max(pt2.createdAt)
                                              from PaymentTransaction pt2
                                             where pt2.booking = b)))
            """)
    OrganizerTotals totalsForOrganizer(@Param("organizerId") Long organizerId,
                                       @Param("eventId") Long eventId,
                                       @Param("state") BookingStatus state,
                                       @Param("provider") PaymentProvider provider,
                                       @Param("earning") Collection<BookingStatus> earning);

    /**
     * Two numbers off one pass. An interface projection rather than an
     * {@code Object[]}, so the call site reads what it is getting instead of
     * casting row[1] and hoping.
     */
    interface OrganizerTotals {
        long getTxCount();
        long getSettledUsdCents();
    }

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

    // --- admin ---------------------------------------------------------------

    /**
     * Every booking belonging to any of these users, newest first.
     *
     * <p>One query for the whole page of the admin user list, rather than one
     * per row. The screen shows a booking count and a lifetime spend against
     * each account, and asking per user turned a twenty-row table into twenty-
     * one round trips.
     */
    List<Booking> findByUserIdInOrderByCreatedAtDesc(Collection<Long> userIds);

    /**
     * The dashboard's latest-bookings strip. {@code event} is fetched with it
     * because the strip prints the event title, and a lazy proxy resolved
     * during serialisation is the same N+1 by a quieter route.
     */
    @Query("""
            select b from Booking b
            join fetch b.event
            order by b.createdAt desc
            """)
    List<Booking> findRecentWithEvent(Pageable pageable);

    long countByState(BookingStatus state);

    /** Gross receipts. Only CONFIRMED counts - see PlatformStatsResponse. */
    @Query("select coalesce(sum(b.totalUsdCents), 0) from Booking b where b.state in :states")
    long sumTotalUsdCentsByStateIn(@Param("states") Collection<BookingStatus> states);

    /**
     * The same sum, but only since a cutoff - the dashboard's recent-takings
     * figure.
     *
     * <p>Sits beside the lifetime total rather than replacing it, because the
     * two say different things and the lifetime one alone says very little: it
     * only ever goes up, so it cannot tell a good month from a dead one. The
     * cutoff is the caller's rather than a constant here, so the window stays a
     * product decision.
     */
    @Query("""
            select coalesce(sum(b.totalUsdCents), 0) from Booking b
            where b.state in :states and b.createdAt >= :since
            """)
    long sumTotalUsdCentsByStateInSince(@Param("states") Collection<BookingStatus> states,
                                        @Param("since") Instant since);

    /**
     * Confirmed revenue per event, for every event at once.
     *
     * <p>Returns {@code [eventId, sumUsdCents]} per row; events with no
     * confirmed bookings are simply absent, so the caller defaults to zero.
     */
    @Query("""
            select b.event.id, coalesce(sum(b.totalUsdCents), 0)
            from Booking b
            where b.state in :states
            group by b.event.id
            """)
    List<Object[]> sumRevenueByEvent(@Param("states") Collection<BookingStatus> states);

    /**
     * Same as {@link #sumRevenueByEvent}, for one event - the ticket-sold
     * Telegram message wants this one event's running total right after a
     * sale, not a map over every event the organiser owns.
     */
    @Query("select coalesce(sum(b.totalUsdCents), 0) from Booking b where b.event.id = :eventId and b.state in :states")
    long sumRevenueForEvent(@Param("eventId") Long eventId, @Param("states") Collection<BookingStatus> states);

    /**
     * Does anyone hold a booking on this event, in any state at all?
     *
     * <p>The delete guard, and deliberately unfiltered by state: an EXPIRED or
     * CANCELLED booking is still a row pointing at {@code event_id}, and
     * {@code booking.event_id} carries no ON DELETE clause - so a delete past
     * one of those fails as a raw 23503 rather than politely. Counting only the
     * states a person would call "a real booking" would make the refusal
     * disagree with what Postgres is prepared to allow.
     */
    long countByEvent_Id(Long eventId);

    /**
     * Bookings per event, for every event at once - the moderation table's
     * "can this be deleted" column.
     *
     * <p>Separate from {@link #sumRevenueByEvent} because that one counts only
     * CONFIRMED money, and an event with one EXPIRED booking and no revenue is
     * still undeletable. Events with none are absent; the caller defaults to
     * zero, which is what makes the Remove button appear.
     */
    @Query("select b.event.id, count(b) from Booking b group by b.event.id")
    List<Object[]> countByEvent();

    /**
     * How many bookings on this event sit in these states.
     *
     * <p>Narrower than {@link #countByEvent_Id}, and for a different job: that
     * one is the delete guard and counts every row including EXPIRED ones,
     * because those still hold an FK. This counts the bookings an invoice is a
     * summary of, so it has to agree with {@link #sumRevenueForEvent} about
     * which states are money - a count that included expired holds beside a
     * total that did not would put "48 bookings, $0.00" on a document somebody
     * is paid against.
     */
    long countByEvent_IdAndStateIn(Long eventId, Collection<BookingStatus> states);

    // --- force delete ---------------------------------------------------------

    /**
     * Every booking on this event, oldest first, with the buyer's details.
     *
     * <p>Feeds the export an admin downloads before a force delete, so the
     * order is the order they happened rather than anything the screen chose:
     * the file is a record of the event's sales, and a record reads
     * chronologically.
     *
     * <p>Unfiltered by state on purpose, matching {@link #countByEvent_Id}. An
     * EXPIRED booking is not money owed to anybody, but it is a row the force
     * delete is about to destroy, and an export that omitted it would not be
     * the complete record it claims to be.
     */
    List<Booking> findByEvent_IdOrderByCreatedAtAsc(Long eventId);

    /**
     * Erase every booking on this event.
     *
     * <p>Only ever called by EventForceDeletionService, and only after
     * everything pointing AT these bookings has already gone - tickets,
     * payments, history. Called in any other order it fails as a 23503, which
     * is the right outcome: the constraint is the last thing standing between
     * a mis-ordered delete and a half-erased event.
     */
    @Modifying
    @Query("delete from Booking b where b.event.id = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);
}
