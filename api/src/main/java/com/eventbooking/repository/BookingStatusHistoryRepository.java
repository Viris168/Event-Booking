package com.eventbooking.repository;

import com.eventbooking.model.BookingStatusHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BookingStatusHistoryRepository extends JpaRepository<BookingStatusHistory, Long> {

    /** Chronological audit trail for admin tooling; served by idx_booking_status_history_booking. */
    List<BookingStatusHistory> findByBookingIdOrderByChangedAtAsc(Long bookingId);
}
