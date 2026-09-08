package com.eventbooking.ticket;

import com.eventbooking.Enumeration.GateAction;
import com.eventbooking.model.ScanLog;
import com.eventbooking.model.Ticket;
import com.eventbooking.repository.ScanLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;

/**
 * Writes down what happened at the door.
 *
 * <p><b>Never throws.</b> Every method swallows its own failures and logs them,
 * because an audit trail that can break a check-in is worse than no audit trail
 * at all - a steward with a queue does not care that the logging table is full.
 * The trade is explicit: a lost row over a refused guest.
 *
 * <p>Runs inside the caller's transaction, so a scan that rolls back takes its
 * log row with it. That is the right way round: a row claiming a ticket was
 * admitted, next to a ticket that was not, is worse than silence.
 */
@Component
public class GateAuditor {

    private static final Logger log = LoggerFactory.getLogger(GateAuditor.class);
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    /** The value stored in {@code outcome} for a reversed check-in. */
    public static final String UNDONE = "UNDONE";

    private final ScanLogRepository scanLogRepository;

    public GateAuditor(ScanLogRepository scanLogRepository) {
        this.scanLogRepository = scanLogRepository;
    }

    /** A single-ticket scan, admitted or refused. */
    public void recordScan(Long eventId, Long operatorUserId, String payload,
                           ScanOutcome outcome, Ticket ticket) {
        write(eventId, operatorUserId, GateAction.SCAN, outcome.name(), payload, ticket, null);
    }

    /** A group admission. {@code note} carries how many went in. */
    public void recordGroupConfirm(Long eventId, Long operatorUserId, String payload,
                                   ScanOutcome outcome, Ticket scanned, String note) {
        write(eventId, operatorUserId, GateAction.GROUP_CONFIRM, outcome.name(), payload, scanned, note);
    }

    /**
     * A reversal. No payload: an undo is done from a ticket id on a supervisor's
     * screen, not from a scanned code, so there is nothing to fingerprint.
     */
    public void recordUndo(Long eventId, Long operatorUserId, Ticket ticket, String note) {
        write(eventId, operatorUserId, GateAction.UNDO, UNDONE, null, ticket, note);
    }

    // ------------------------------------------------------------------

    private void write(Long eventId, Long operatorUserId, GateAction action, String outcome,
                       String payload, Ticket ticket, String note) {
        try {
            Long ticketId = ticket == null ? null : ticket.getId();
            Long bookingId = ticket == null ? null
                    : ticket.getBookingItem().getBooking().getId();

            scanLogRepository.save(ScanLog.builder()
                    .eventId(eventId)
                    .operatorUserId(operatorUserId)
                    .action(action)
                    .outcome(outcome)
                    .ticketId(ticketId)
                    .bookingId(bookingId)
                    .payloadFingerprint(fingerprint(payload))
                    .note(note)
                    .at(Instant.now())
                    .build());
        } catch (RuntimeException e) {
            // Deliberately swallowed. See the class javadoc: the gate keeps
            // working even when the trail does not.
            log.error("Could not write a scan_log row for event {} ({} {})",
                    eventId, action, outcome, e);
        }
    }

    /**
     * SHA-256 of the presented code, base64url.
     *
     * <p>Not the code. A payload opens a gate, and this table is read by more
     * people than the ticket table is. The digest is enough to spot the same
     * refused code at four doors, and useless to anyone who copies it.
     */
    private static String fingerprint(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(payload.trim().getBytes(StandardCharsets.UTF_8));
            return ENCODER.encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is required of every JRE; a failure here is a broken platform.
            return null;
        }
    }
}
