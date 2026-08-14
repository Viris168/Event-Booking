package com.eventbooking.model;

import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;
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
 * One attempt at collecting a booking's money.
 *
 * <p>A booking may accumulate several of these - a retry after a bad PIN, a
 * KHQR that nobody scanned before it expired, a later switch to PayWay - but
 * only ever one with {@code status = SUCCESS}, which
 * {@code uq_payment_txn_one_success_per_booking} enforces in the database
 * rather than in application code.
 *
 * <p>For Bakong the row is settled by polling, not by a callback:
 * {@code providerRef} holds the md5 of {@link #qrPayload}, which is the key
 * {@code /v1/check_transaction_by_md5} is asked about, and
 * {@code providerTxnHash} holds the settlement hash that comes back once the
 * money has actually landed.
 */
@Entity
@Table(name = "payment_transaction")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id", nullable = false, updatable = false)
    private Booking booking;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, updatable = false)
    private PaymentProvider provider;

    /**
     * The provider's handle on this attempt. For Bakong it is the md5 of the
     * KHQR string; uq_payment_txn_provider_ref makes it unique per provider,
     * so the same QR can never be represented by two open rows.
     */
    @Column(name = "provider_ref")
    private String providerRef;

    /**
     * Guards against the same attempt being opened twice by a double-submitted
     * "pay now". UNIQUE in the schema, so a race that gets past the booking row
     * lock still fails on the insert instead of minting a second QR.
     */
    @Column(name = "idempotency_key", nullable = false, unique = true, updatable = false)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "currency_charged", nullable = false, updatable = false)
    private PaymentCurrency currencyCharged;

    /**
     * Both amounts are stored whichever currency was charged, copied off the
     * booking so the pair always agrees with the FX rate snapshotted there.
     */
    @Column(name = "amount_usd_cents", nullable = false, updatable = false)
    private Long amountUsdCents;

    @Column(name = "amount_khr", nullable = false, updatable = false)
    private Long amountKhr;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private PaymentStatus status = PaymentStatus.CREATED;

    /**
     * When the QR stops being scannable. Shorter than the booking's payment
     * window on purpose: an abandoned QR should be reclaimed quickly so the
     * customer can start a fresh attempt while the inventory is still theirs.
     */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** Written by the app rather than left to the column DEFAULT, for the same
     *  reason as {@link Booking#getCreatedAt()}: a non-insertable column is not
     *  read back after the INSERT, and the response needs it. */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Stamped once the attempt leaves {@link PaymentStatus#isOpen()}. */
    @Column(name = "resolved_at")
    private Instant resolvedAt;

    /** The EMVCo/KHQR string. Kept so a page reload re-renders the same QR
     *  instead of opening a second attempt. Null for redirect providers. */
    @Column(name = "qr_payload", updatable = false)
    private String qrPayload;

    /** Bakong's settled transaction hash - not the md5 in {@link #providerRef}. */
    @Column(name = "provider_txn_hash")
    private String providerTxnHash;

    @Column(name = "last_polled_at")
    private Instant lastPolledAt;

    @Column(name = "poll_attempts", nullable = false)
    @Builder.Default
    private Integer pollAttempts = 0;

    /** Reconciler free text: a decline reason, or a flag such as money landing
     *  after the booking had already died. */
    @Column(name = "note")
    private String note;

    public boolean isOpen() {
        return status.isOpen();
    }

    public boolean hasExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    /** Records that the provider was asked about this attempt, whatever it said. */
    public void markPolled(Instant now) {
        this.lastPolledAt = now;
        this.pollAttempts = (pollAttempts == null ? 0 : pollAttempts) + 1;
    }
}
