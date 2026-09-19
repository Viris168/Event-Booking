package com.eventbooking.repository;

import com.eventbooking.model.BookingItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BookingItemRepository extends JpaRepository<BookingItem, Long> {

    List<BookingItem> findByBookingId(Long bookingId);

    /**
     * Erase every line of every booking on this event.
     *
     * <p>{@code booking_item} cascades from {@code booking} in the database, so
     * this looks redundant - and it is not, because of what the lines point at
     * in the other direction. {@code booking_item.event_seat_id} and
     * {@code event_zone_id} reference the inventory with no ON DELETE clause,
     * and the inventory is dropped by the event's own cascade. Clearing the
     * lines explicitly, before the event goes, is what keeps that from failing
     * as a 23503 halfway through.
     */
    @Modifying
    @Query("delete from BookingItem bi where bi.booking.event.id = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);
}
