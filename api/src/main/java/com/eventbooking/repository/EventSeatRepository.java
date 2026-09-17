package com.eventbooking.repository;

import com.eventbooking.model.EventSeat;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EventSeatRepository extends JpaRepository<EventSeat, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from EventSeat s where s.holdId = :holdId order by s.id")
    List<EventSeat> findByHoldIdForUpdate(@Param("holdId") Long holdId);

    List<EventSeat> findByEventId(Long eventId);


    List<EventSeat> findByHoldId(Long holdId);

    /**
     * Seat counts per event, grouped by status, for every event at once.
     *
     * <p>The companion to EventZoneRepository.totalsByEvent: a SEATED or MIXED
     * event keeps part or all of its inventory here, and a moderation row that
     * counted only zones would report a sold-out seat map as zero capacity.
     *
     * <p>Returns {@code [eventId, status, count]} per row. BLOCKED seats are
     * included in the caller's capacity on purpose - they are places that
     * exist and are deliberately not for sale, which is what the bar shows.
     */
    @org.springframework.data.jpa.repository.Query("""
            select s.event.id, s.status, count(s)
            from EventSeat s
            group by s.event.id, s.status
            """)
    java.util.List<Object[]> statusCountsByEvent();

    /**
     * Seats in one state at one event - the seated half of "has this sold
     * anything yet", which decides whether its organiser may still pull it.
     *
     * <p>Single-event, unlike statusCountsByEvent above: that one feeds the
     * moderation table and aggregates the whole platform in a single query,
     * which is the wrong shape for a question asked about one event during a
     * write.
     */
    long countByEvent_IdAndStatus(Long eventId, com.eventbooking.Enumeration.SeatStatus status);

    /**
     * Which events have laid inventory over these venue seats.
     *
     * <p>Asked before a venue seat section is deleted. Deliberately NOT filtered
     * by status: an AVAILABLE event_seat is still a row with a foreign key into
     * venue_seat, so deleting under it fails at the constraint whether or not
     * anyone has bought it. The status distinction matters when removing seats
     * from an EVENT; here the reference itself is the blocker.
     *
     * <p>Returns event ids rather than a count so the refusal can name them -
     * "in use by 2 events" is not something an organiser can act on.
     */
    @org.springframework.data.jpa.repository.Query("""
            select distinct s.event.id
            from EventSeat s
            where s.venueSeat.id in :venueSeatIds
            """)
    List<Long> findEventIdsUsingVenueSeats(@Param("venueSeatIds") java.util.Collection<Long> venueSeatIds);
}
