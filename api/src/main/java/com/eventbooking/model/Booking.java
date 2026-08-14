package com.eventbooking.model;

import com.eventbooking.Enumeration.BookingStatus;
import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * A converted hold. A booking never exists before checkout: it is created by
 * BookingService.convertHold(...) in the same transaction that consumes the
 * hold, so `hold_id` is NOT NULL and UNIQUE - one hold yields at most one
 * booking, forever.
 *
 * `state` is only ever written through BookingStateMachine. Setting it
 * directly bypasses both the legality check and the booking_status_history
 * audit row, so treat the setter as package-internal by convention.
 */
@Entity
@Table(name = "booking")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Human-quotable reference printed on the ticket, e.g. "KH-7QF2M8ZP". */
    @Column(name = "booking_ref", nullable = false, unique = true, updatable = false)
    private String bookingRef;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "hold_id", nullable = false, unique = true, updatable = false)
    private Hold hold;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false)
    @Builder.Default
    private BookingStatus state = BookingStatus.PENDING_PAYMENT;

    @Column(name = "buyer_name", nullable = false)
    private String buyerName;

    @Column(name = "buyer_phone_e164", nullable = false)
    private String buyerPhoneE164;

    @Column(name = "buyer_email")
    private String buyerEmail;

    @Column(name = "subtotal_usd_cents", nullable = false)
    private Long subtotalUsdCents;

    @Column(name = "total_usd_cents", nullable = false)
    private Long totalUsdCents;

    /**
     * The USD->KHR rate in force at booking time, snapshotted so a later rate
     * move cannot change what the customer was quoted or already paid.
     */
    @Column(name = "fx_rate_khr_per_usd", nullable = false, precision = 12, scale = 4)
    private BigDecimal fxRateKhrPerUsd;

    @Column(name = "total_khr", nullable = false)
    private Long totalKhr;

    /**
     * Written by the app rather than left to the column's DEFAULT now() (as
     * Event and Hold do). An insertable = false column is not read back after
     * the INSERT, which would hand the checkout response a booking whose
     * createdAt is null. Setting it explicitly also pins createdAt and the
     * first stateChangedAt to the same instant.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "state_changed_at", nullable = false)
    private Instant stateChangedAt;

    @OneToMany(mappedBy = "booking", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<BookingItem> items = new ArrayList<>();

    public void addItem(BookingItem item) {
        item.setBooking(this);
        items.add(item);
    }
}
