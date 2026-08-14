package com.eventbooking.model;

import com.eventbooking.Enumeration.BookingStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * Append-only audit trail: one row per accepted state change, written by
 * BookingStateMachine. Rows are never updated or deleted - a mistaken
 * transition is corrected by transitioning again, which appends another row.
 *
 * fromState is null exactly once per booking, on the creation row that
 * records the initial PENDING_PAYMENT.
 */
@Entity
@Table(name = "booking_status_history")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id", nullable = false)
    private Booking booking;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_state")
    private BookingStatus fromState;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_state", nullable = false)
    private BookingStatus toState;

    /**
     * Who caused the change. Null for machine-driven transitions - the hold
     * sweeper expiring a booking, or a payment webhook confirming one.
     */
    @Column(name = "changed_by_user_id")
    private Long changedByUserId;

    @Column(name = "note")
    private String note;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;
}
