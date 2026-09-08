package com.eventbooking.dto.ticket;

import com.eventbooking.ticket.ScanOutcome;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;

/**
 * What a booking looks like before anyone is let in.
 *
 * <p><b>This endpoint admits nobody.</b> It is the screen a steward reads
 * between scanning a family's code and deciding how many of them are actually
 * standing there. Nothing here takes a lock and nothing here is consumed, so it
 * is safe to call twice, or to call and walk away from.
 *
 * <p>That is the whole reason preview and confirm are separate calls. The
 * objection to group passes was always that they put a steward in the position
 * of guessing how many people one code admits - so the count is shown first,
 * and the admission is a second, explicit act.
 *
 * <p><b>Why every ticket is listed, not just the free ones.</b> "Two of four
 * are already inside" is the fact a steward needs to resolve an argument at the
 * door, and it is invisible if the used rows are filtered out. The list carries
 * each ticket's own state instead.
 *
 * <p>Same contract as {@link ScanResponse}: <b>always HTTP 200</b>. A forged
 * code is a successful answer of "no".
 *
 * @param admissible whether a confirm right now would let anybody in - the
 *                   outcome is VALID <em>and</em> somebody is still outside.
 *                   A party that has fully arrived is not a refusal, but the
 *                   button should not be live
 * @param outcome    why, for the steward's screen. VALID here means "this is a
 *                   real booking at the right gate", never "somebody was
 *                   admitted"
 * @param message    that reason in words, ready to display
 * @param booking    who this party is. Null when the code could not be tied to
 *                   a booking at all
 * @param tickets    every ticket on the booking, admitted or not, in the order
 *                   a steward would read them out. Empty on a refusal that
 *                   resolved nothing
 * @param total      tickets on the whole booking, across every line
 * @param checkedIn  how many have already walked in
 * @param remaining  how many a confirm could still admit
 */
@Schema(description = "A booking's admission state. Reads only - nobody is admitted by this call.")
public record GroupPreviewResponse(

        boolean admissible,
        ScanOutcome outcome,
        String message,
        ScannedParty booking,
        List<PreviewTicket> tickets,
        long total,
        long checkedIn,
        long remaining
) {

    /**
     * One ticket on the booking, with its own state.
     *
     * <p>Carries {@code checkedIn} where {@link GroupConfirmResponse.AdmittedTicket}
     * does not: confirm lists only what it just granted, so every row there is
     * by definition fresh. Here the mix is the point.
     *
     * <p>No {@code qrPayload}, for the same reason as everywhere else at the
     * gate - echoing bearer secrets back to whoever scanned them would let a
     * scanner harvest working tickets, and a group call would harvest a whole
     * family's at once.
     *
     * @param bookingItemId the line this ticket came off, so a client can group
     *                      the party by tier rather than showing one flat list
     * @param assigned      true for a seat, false for a zone admission. <b>The
     *                      distinction the gate turns on:</b> zone tickets are
     *                      interchangeable, so "admit 3 standing" is a complete
     *                      instruction; seats are not, and "admit 3 seats" is a
     *                      guess at which three people are present
     * @param seatLocation null for a zone ticket. Standing admission has no
     *                     seat, and inventing a label is a lie a steward might
     *                     act on
     * @param checkedInAt  when this one came in. Null while it is still free -
     *                     and the most useful thing on the screen when it is
     *                     not, because "an hour ago" and "40 seconds ago" call
     *                     for very different conversations
     */
    @Schema(description = "One ticket on the booking. Never includes the QR payload.")
    public record PreviewTicket(
            Long ticketId,
            Long bookingItemId,
            String tierName,
            String seatLocation,
            Integer unitSeq,
            boolean assigned,
            boolean checkedIn,
            Instant checkedInAt
    ) {
    }

    // ------------------------------------------------------------------
    // Factories - one per ending, so no caller assembles this by hand
    // ------------------------------------------------------------------

    /**
     * The code never resolved to a booking: malformed, forged, or unknown.
     * Carries no counts because there is nothing to count.
     */
    public static GroupPreviewResponse refused(ScanOutcome outcome, String message) {
        return new GroupPreviewResponse(false, outcome, message, null, List.of(), 0, 0, 0);
    }

    /**
     * A real booking, refused for a reason about the booking rather than the
     * code - not confirmed, or not this event. The counts and the ticket list
     * are still real, so the steward can see what they are holding and explain
     * it to the person in front of them.
     */
    public static GroupPreviewResponse refused(ScanOutcome outcome, String message,
                                               ScannedParty booking, List<PreviewTicket> tickets) {
        long checkedIn = tickets.stream().filter(PreviewTicket::checkedIn).count();
        return new GroupPreviewResponse(false, outcome, message, booking, List.copyOf(tickets),
                tickets.size(), checkedIn, tickets.size() - checkedIn);
    }

    /**
     * A real booking at the right gate.
     *
     * <p>The counts are derived from the list rather than queried, because the
     * caller has already loaded every row to build it - a preview that then ran
     * two count queries would be asking the database something it just read.
     */
    public static GroupPreviewResponse of(ScannedParty booking, List<PreviewTicket> tickets) {
        long checkedIn = tickets.stream().filter(PreviewTicket::checkedIn).count();
        long remaining = tickets.size() - checkedIn;

        return new GroupPreviewResponse(
                remaining > 0, ScanOutcome.VALID,
                remaining == 0
                        ? "Everyone on this booking is already inside."
                        : remaining + " of " + tickets.size() + " still to come in.",
                booking, List.copyOf(tickets), tickets.size(), checkedIn, remaining);
    }
}
