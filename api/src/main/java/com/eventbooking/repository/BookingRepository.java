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
