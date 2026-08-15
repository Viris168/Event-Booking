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
import java.util.UUID;

/**
 * One admission unit - one person through the gate, once.
 *
 * <p><b>Not one per booking_item.</b> A seat line is always {@code qty = 1} and
 * yields a single ticket, but a zone line with {@code qty = 3} is three people
 * arriving separately, so it yields three independently scannable tickets
 * numbered {@code unit_seq} 1..3. {@code UNIQUE (booking_item_id, unit_seq)} is
 * what makes issuance safe to retry: a second attempt collides rather than
 * minting duplicates for the same seat.
 *
 * <p>{@link #qrToken} is the bearer secret. It never appears in a URL or a log -
 * it is carried inside the signed payload the QR encodes (see
 * {@code TicketTokenCodec}), and a scan is only honoured when the token in the
 * payload matches the one stored here.
 */
@Entity
@Table(name = "ticket")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_item_id", nullable = false, updatable = false)
    private BookingItem bookingItem;

    /** 1-based position within its line: ticket 2 of a 3-seat zone purchase. */
    @Column(name = "unit_seq", nullable = false, updatable = false)
    private Integer unitSeq;

    /**
     * Random per ticket, so a valid code cannot be guessed from a neighbouring
     * one. The database would default this, but it is set in the application
     * for the same reason as {@code Booking.createdAt}: a column that is not
     * insertable is not read back after the INSERT, and the QR has to be built
     * from it in the same call.
     */
    @Column(name = "qr_token", nullable = false, unique = true, updatable = false)
    private UUID qrToken;

    /** Stamped by the first scan that wins the row lock. Null means unused. */
    @Column(name = "checked_in_at")
    private Instant checkedInAt;

    /** The gate operator, scalar for the same reason as {@code Booking.userId}. */
    @Column(name = "checked_in_by")
    private Long checkedInBy;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    public boolean isCheckedIn() {
        return checkedInAt != null;
    }
}
