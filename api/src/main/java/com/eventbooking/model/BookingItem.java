package com.eventbooking.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * One line of a booking. Exactly one of eventSeat / eventZone is set - the
 * booking_item CHECK constraint in V1__schema.sql enforces that a seat line
 * always has qty = 1 and a zone line has qty > 0. Seat and zone lines coexist
 * freely on one booking, which is what makes a MIXED event checkout work.
 *
 * Prices are snapshotted into unit_price_usd_cents at booking time on purpose:
 * an organizer re-pricing a seat_class later must not retroactively change what
 * an existing customer owes.
 */
@Entity
@Table(name = "booking_item")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id", nullable = false)
    private Booking booking;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_seat_id")
    private EventSeat eventSeat;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_zone_id")
    private EventZone eventZone;

    @Column(nullable = false)
    @Builder.Default
    private Integer qty = 1;

    @Column(name = "unit_price_usd_cents", nullable = false)
    private Integer unitPriceUsdCents;

    /**
     * When this line stopped occupying its inventory. Null while the line is
     * live; stamped when the booking reaches a terminal state and the seat or
     * zone capacity goes back on sale.
     *
     * The row itself is never deleted - it is financial history - so this
     * column is what lets uq_booking_item_seat_live tell a seat that is still
     * booked from one that merely was, once. See V2__booking_item_release.sql.
     */
    @Column(name = "released_at")
    private Instant releasedAt;

    /** What this line contributes to the booking subtotal. */
    public int lineTotalUsdCents() {
        return unitPriceUsdCents * qty;
    }
}
