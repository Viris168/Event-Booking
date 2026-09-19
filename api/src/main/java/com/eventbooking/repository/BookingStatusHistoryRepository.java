package com.eventbooking.repository;

import com.eventbooking.model.BookingStatusHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BookingStatusHistoryRepository extends JpaRepository<BookingStatusHistory, Long> {

    /** Chronological audit trail for admin tooling; served by idx_booking_status_history_booking. */
    List<BookingStatusHistory> findByBookingIdOrderByChangedAtAsc(Long bookingId);

    /**
     * Erase the audit trail of every booking on this event.
     *
     * <p>An audit trail being deleted deliberately, which is not something this
     * codebase does anywhere else - V30 went out of its way to leave
     * booking_status_history alone when the refund states were dropped. The
     * difference is that there the bookings survived and their history had to
     * keep describing them; here the bookings are going too, and a history row
     * naming a booking id that no longer exists is not a record of anything.
     *
     * <p>What preserves the record instead is the CSV the force delete writes
     * to the log before any of this runs. See EventForceDeletionService.
     */
    @Modifying
    @Query("delete from BookingStatusHistory h where h.booking.event.id = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);
}
