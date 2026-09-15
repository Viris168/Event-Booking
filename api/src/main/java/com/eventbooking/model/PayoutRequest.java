package com.eventbooking.model;

import com.eventbooking.Enumeration.PayoutStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

/**
 * An organiser asking to be settled for one finished event, and what the
 * platform did about it.
 *
 * <p>The money fields are a <b>snapshot</b>, written once when the request is
 * made and never recomputed. That is the entire reason this is a table rather
 * than a query: an invoice is a statement about a moment, and one derived live
 * from {@code booking} would quietly become a different document every time
 * somebody opened it - a booking cancelled the day after the transfer would
 * rewrite an invoice that had already been paid against.
 *
 * <p>{@code eventId}, {@code organizerId} and {@code reviewedBy} are raw Longs
 * rather than {@code @ManyToOne}, matching {@link OrganizerApplication} and
 * {@link OrganizerProfile}. Every one of them is an id the caller already has,
 * and the admin queue renders hundreds of these rows at a time - a lazy proxy
 * per row resolved during serialisation is the same N+1 by a quieter route.
 */
@Entity
@Table(name = "payout_request")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PayoutRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** FK to {@code event.id}. One payout per event, ever - {@code uq_payout_request_event}. */
    @Column(name = "event_id", nullable = false)
    private Long eventId;

    /**
     * FK to {@code organizer_profile.id} - NOT {@code app_user.id}. Copied from
     * {@code event.organizer_id}, which is the same id space, so the organiser's
     * own list can filter without joining through {@code event}.
     */
    @Column(name = "organizer_id", nullable = false)
    private Long organizerId;

    /**
     * Sequential, from {@code payout_invoice_seq}. Deliberately unlike
     * {@code booking_ref}, which is random so that holding one ticket does not
     * let you enumerate the others - an invoice has no such exposure, and
     * accounting wants a run it can spot a gap in.
     */
    @Column(name = "invoice_no", nullable = false, updatable = false)
    private String invoiceNo;

    // ------------------------------------------------------------ the money

    /** Confirmed receipts for the event at request time, in USD cents. */
    @Column(name = "gross_usd_cents", nullable = false)
    private Long grossUsdCents;

    /**
     * The platform's commission as basis points, snapshotted from
     * {@code app.payout.fee-bps}.
     *
     * <p>Stored rather than read at render time because the rate is
     * configuration and configuration changes - a live read would retroactively
     * re-price every invoice ever issued the first time somebody edited the yml.
     */
    @Column(name = "fee_bps", nullable = false)
    private Integer feeBps;

    /** The commission in cents, charged on {@link #grossUsdCents}. */
    @Column(name = "fee_usd_cents", nullable = false)
    private Long feeUsdCents;

    /**
     * What the organiser is owed. A DB CHECK
     * ({@code payout_request_totals_add_up}) holds this to
     * {@code gross - fee}, so an invoice whose own lines contradict its total
     * cannot be written at all.
     */
    @Column(name = "net_usd_cents", nullable = false)
    private Long netUsdCents;

    /** Tickets behind the gross, counted from the same bookings. */
    @Column(name = "tickets_sold", nullable = false)
    private Integer ticketsSold;

    @Column(name = "bookings_count", nullable = false)
    private Integer bookingsCount;

    // ---------------------------------------------------- where it is going

    /**
     * One of ABA, ACLEDA, WING, CANADIA, OTHER - held to that list by a DB
     * CHECK rather than by a Java enum, because the set is a deployment's
     * business rather than the domain's and a new bank should be one migration,
     * not a recompile.
     */
    @Column(name = "payout_method", nullable = false)
    private String payoutMethod;

    @Column(name = "account_name", nullable = false)
    private String accountName;

    @Column(name = "account_number", nullable = false)
    private String accountNumber;

    /** The organiser's note to the reviewer. Optional, never queried. */
    @Column(name = "note")
    private String note;

    // ------------------------------------------- the decision, the transfer

    /**
     * Defaulted here as well as in the DDL, for the reason
     * {@link OrganizerApplication#getStatus()} gives: a builder that omits a
     * NOT NULL DEFAULT column writes an explicit NULL rather than letting the
     * default apply, and the insert fails.
     */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private PayoutStatus status = PayoutStatus.REQUESTED;

    /** Free text the admin may attach when recording the transfer. Optional. */
    @Column(name = "admin_note")
    private String adminNote;

    /** app_user.id of the deciding admin. Null exactly while REQUESTED. */
    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    /**
     * What the admin copied off the bank's confirmation. Required on PAID, by a
     * DB CHECK: PAID is a claim that money moved, and without a reference it is
     * a claim nobody can check.
     */
    @Column(name = "paid_reference")
    private String paidReference;

    @Column(name = "paid_at")
    private Instant paidAt;

    @CreationTimestamp
    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;
}
