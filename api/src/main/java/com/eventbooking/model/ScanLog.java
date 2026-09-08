package com.eventbooking.model;

import com.eventbooking.Enumeration.GateAction;
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

import java.time.Instant;

/**
 * One thing that happened at a door.
 *
 * <p>Written for <b>every</b> gate call, including the refusals. That is the
 * point: a refused scan touches no ticket row, so without a row here a forged
 * code presented forty times leaves no trace at all - and repeat refusals are
 * the actual fraud signal, not the successful admissions.
 *
 * <p>Append-only by convention. Nothing in the application updates or deletes a
 * row, and {@link #ticketId} is a scalar rather than a {@code @ManyToOne} for
 * the same reason as {@code Booking.userId} - plus one this table cares about
 * more: the log has to be writable for a code that matched no ticket, where
 * there is no entity to associate.
 */
@Entity
@Table(name = "scan_log")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScanLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false, updatable = false)
    private Long eventId;

    @Column(name = "operator_user_id", nullable = false, updatable = false)
    private Long operatorUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private GateAction action;

    /** A {@code ScanOutcome} name, or {@code UNDONE}. */
    @Column(nullable = false, updatable = false)
    private String outcome;

    /** Null when the presented code matched no ticket. */
    @Column(name = "ticket_id", updatable = false)
    private Long ticketId;

    @Column(name = "booking_id", updatable = false)
    private Long bookingId;

    /**
     * SHA-256 of what was scanned, never the scan itself.
     *
     * <p>A payload is a bearer credential. Logging it verbatim would make this
     * table a list of working tickets, readable by everyone who can read an
     * audit trail - a strictly larger group than those who can read the ticket
     * table. The digest answers "was this same code tried at four doors"
     * without holding anything that opens one.
     */
    @Column(name = "payload_fingerprint", updatable = false)
    private String payloadFingerprint;

    @Column(updatable = false)
    private String note;

    @Column(name = "at", nullable = false, updatable = false)
    private Instant at;
}
