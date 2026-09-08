package com.eventbooking.dto.ticket;

import com.eventbooking.ticket.ScanOutcome;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * The answer to "admit N of this booking".
 *
 * <p>Same contract as {@link ScanResponse}: <b>always HTTP 200</b>, including
 * for a forged code or a party that is already fully inside. A steward holding
 * up a queue needs one shape to render from, and "no, only two are left" is a
 * successful answer to "may I admit four".
 *
 * <p><b>Why the admitted tickets are listed rather than just counted.</b> A
 * booking can mix seat and zone lines, and admitting five people off one scan
 * is useless if the steward cannot tell them where to sit. The count answers
 * the turnstile; the list answers the person holding the door.
 *
 * <p><b>Why {@code remaining} appears on refusals too.</b> The commonest
 * refusal is asking for more than are free - two of the party came in an hour
 * ago and nobody at the door knows. Sending the real number back means the app
 * can re-offer "admit 2" immediately instead of making the steward guess.
 *
 * @param admitted      whether anyone went in on this call. Exactly
 *                      {@code admittedCount > 0}, carried separately so a gate
 *                      UI can key on the same field name it reads from
 *                      {@link ScanResponse}
 * @param admittedCount how many were admitted by <em>this</em> call - not how
 *                      many are inside
 * @param outcome       why, for the steward's screen
 * @param message       that reason in words, ready to display
 * @param booking       who this party is, as {@link ScannedParty} - the same
 *                      shape preview returns, so a client maps it once. Null
 *                      when the code could not be tied to a booking at all
 * @param tickets       the admissions this call granted, in the order a steward
 *                      would read them out. Empty on every refusal
 * @param total         tickets on the whole booking, across every line
 * @param remaining     still outside after this call
 */
@Schema(description = "The result of admitting part or all of a booking from one scan.")
public record GroupConfirmResponse(

        boolean admitted,
        int admittedCount,
        ScanOutcome outcome,
        String message,
        ScannedParty booking,
        List<AdmittedTicket> tickets,
        long total,
        long remaining
) {

    /**
     * One admission this call granted.
     *
     * <p>Deliberately leaner than {@link ScanResponse.ScannedTicket}, and for
     * the same reason it exists at all: no {@code qrPayload}. Echoing a bearer
     * secret back to whoever scanned it would let a scanner harvest working
     * tickets - and a group call would harvest a whole family's at once.
     *
     * @param seatLocation null for a zone ticket. Standing admission has no
     *                     seat, and inventing a label is a lie a steward might
     *                     act on
     */
    @Schema(description = "One admission granted by this call. Never includes the QR payload.")
    public record AdmittedTicket(
            Long ticketId,
            String tierName,
            String seatLocation,
            Integer unitSeq
    ) {
    }

    // ------------------------------------------------------------------
    // Factories - one per ending, so no caller assembles this by hand
    // ------------------------------------------------------------------

    /**
     * The code never resolved to a booking: malformed, forged, or unknown.
     * Carries no counts because there is nothing to count.
     */
    public static GroupConfirmResponse refused(ScanOutcome outcome, String message) {
        return new GroupConfirmResponse(false, 0, outcome, message, null, List.of(), 0, 0);
    }

    /**
     * A real booking, refused for a reason about the booking rather than the
     * request - not confirmed, or not this event. Counts are real, so the
     * screen can still show the steward what they are holding.
     */
    public static GroupConfirmResponse refused(ScanOutcome outcome, String message,
                                               ScannedParty booking, long total, long remaining) {
        return new GroupConfirmResponse(false, 0, outcome, message, booking, List.of(), total, remaining);
    }

    /**
     * They asked for more than are free.
     *
     * <p>Nothing is admitted - deliberately, rather than admitting as many as
     * possible. A steward who asked for four and silently got two will wave
     * four people through.
     */
    public static GroupConfirmResponse tooMany(ScannedParty booking, long total, long remaining) {
        return new GroupConfirmResponse(
                false, 0, ScanOutcome.REQUESTED_MORE_THAN_REMAINING,
                "Only " + remaining + " of this booking " + (remaining == 1 ? "is" : "are")
                        + " still to come in.",
                booking, List.of(), total, remaining);
    }

    /**
     * One of the named tickets is not on this booking, or has already been
     * used. Admits nobody, for the same reason as {@link #tooMany}.
     */
    public static GroupConfirmResponse notInParty(ScannedParty booking, String message,
                                                  long total, long remaining) {
        return new GroupConfirmResponse(false, 0, ScanOutcome.TICKET_NOT_IN_PARTY, message,
                booking, List.of(), total, remaining);
    }

    /**
     * Admitted. {@code remaining} is counted <em>after</em> the stamp, so a
     * party that is now complete reads zero rather than one behind.
     */
    public static GroupConfirmResponse admitted(ScannedParty booking, List<AdmittedTicket> tickets,
                                                long total, long remaining) {
        int count = tickets.size();
        return new GroupConfirmResponse(
                count > 0, count, ScanOutcome.VALID,
                count == 1 ? "Admit one." : "Admit " + count + ".",
                booking, List.copyOf(tickets), total, remaining);
    }
}
