package com.eventbooking.service.notification;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.Enumeration.PayoutStatus;

/**
 * What the domain announces. Not what anybody is told about it.
 *
 * <p>These are facts, not messages: a booking changed state, an event was
 * reviewed. Who hears about it, in what words, and whether anybody hears at all
 * is {@link NotificationListener}'s business. Keeping the split means
 * {@code BookingStateMachine} has no opinion about notifications - it announces
 * the same event whether the answer is "tell the customer and the organiser" or
 * "tell nobody", and adding an audience later does not touch it.
 *
 * <p>Every record carries ids and enums only, never a loaded entity. The
 * listener runs after the publishing transaction has committed, so an entity put
 * in here would arrive detached and throw on the first lazy field - and the
 * fields these notifications need are almost all behind a lazy association.
 * Passing an id costs one query in the listener and cannot be got wrong.
 */
public final class NotificationEvents {

    private NotificationEvents() {
    }

    /**
     * A booking moved. Published for every transition, including the ones
     * nobody is told about - the listener is where that is decided, and a state
     * machine that filtered first would have to be edited every time the
     * product changed its mind about which states are worth an interruption.
     */
    public record BookingStateChanged(Long bookingId, BookingStatus from, BookingStatus to) {
    }

    /**
     * An event moved through review, in either direction: an organiser
     * submitting or withdrawing, an admin approving, rejecting, asking for
     * changes, or taking it down.
     *
     * @param message  the admin's note. Present for REJECT and REQUEST_CHANGES,
     *                 where it is the entire point of the notification - "changes
     *                 requested" with no reason sends the organiser back to a
     *                 form to guess
     * @param reviewId the {@code event_review} row this decision wrote, and the
     *                 only thing here that distinguishes one occurrence from the
     *                 next. An event can be rejected, resubmitted and rejected
     *                 again: keyed on the event and its status, the second
     *                 refusal would look identical to the first and be
     *                 deduplicated into silence, leaving the organiser waiting
     *                 on a decision that had already been made. Null for
     *                 TAKE_DOWN, which writes no review row and is terminal by
     *                 construction, so it can only happen once per event
     */
    public record EventReviewed(Long eventId, EventTransition transition, String message, Long reviewId) {
    }

    /** Somebody asked to become an organiser. */
    public record OrganizerApplicationSubmitted(Long applicationId) {
    }

    /** An admin decided on that application. */
    public record OrganizerApplicationDecided(Long applicationId, OrganizerApplicationStatus decision) {
    }

    /**
     * An organiser asked to be paid for a finished event.
     *
     * <p>Like every record here, an id and nothing else. The listener loads the
     * row and reads the money off it rather than being handed the amount,
     * because an amount passed through here would be a second copy of a number
     * whose whole point is that there is exactly one - the snapshot in
     * {@code payout_request}.
     */
    public record PayoutRequested(Long payoutId) {
    }

    /**
     * The platform answered: approved, or paid.
     *
     * <p>One record for both rather than two, unlike the booking and event
     * families above. Those carry different audiences and different payloads
     * per transition; these two go to the same person, about the same row, and
     * differ only in which sentence gets rendered - which is a switch in the
     * listener, not two event types.
     *
     * @param decision the status the row landed in. Never REQUESTED: that is
     *                 {@link PayoutRequested}, which goes to a different
     *                 audience entirely
     */
    public record PayoutDecided(Long payoutId, PayoutStatus decision) {
    }
}
