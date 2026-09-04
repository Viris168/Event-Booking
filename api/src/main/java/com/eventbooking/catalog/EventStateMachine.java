package com.eventbooking.catalog;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.catalog.error.InvalidEventStatusTransitionException;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Set;
import java.util.Map;

/**
 * The one place that knows which status may follow which.
 *
 * <p>Before this existed the rules were three scattered {@code if} statements
 * inside EventServiceimpl, and they disagreed with each other: publish allowed
 * only DRAFT, takedown allowed anything that was not already TAKEN_DOWN - which
 * silently included DRAFT, so an event could be taken down before it was ever
 * on sale. Neither read as a rule, both read as a guard, and nothing tied them
 * together.
 *
 * <p>The table below is the whole specification. Edges that are not in it are
 * illegal by omission rather than by an {@code else} branch someone has to
 * remember to write, which is what makes adding a state safe: a new status with
 * no entries here can be entered by nothing and left by nothing until its edges
 * are declared deliberately.
 *
 * <pre>
 *   DRAFT             --SUBMIT----------> PENDING_REVIEW
 *   CHANGES_REQUESTED --SUBMIT----------> PENDING_REVIEW
 *   PENDING_REVIEW    --WITHDRAW--------> DRAFT
 *   PENDING_REVIEW    --APPROVE---------> APPROVED
 *   PENDING_REVIEW    --REJECT----------> REJECTED
 *   PENDING_REVIEW    --REQUEST_CHANGES-> CHANGES_REQUESTED
 *   APPROVED          --PUBLISH---------> PUBLISHED
 *   APPROVED          --WITHDRAW--------> DRAFT
 *   PUBLISHED         --TAKE_DOWN-------> TAKEN_DOWN
 * </pre>
 *
 * <p>REJECTED and TAKEN_DOWN have no outgoing edges: both are terminal, and a
 * rejected event becomes a new draft by being duplicated, not by being revived.
 */
@Component
public class EventStateMachine {

    private static final Map<EventStatus, Map<EventTransition, EventStatus>> EDGES =
            new EnumMap<>(EventStatus.class);

    static {
        EDGES.put(EventStatus.DRAFT, Map.of(
                EventTransition.SUBMIT, EventStatus.PENDING_REVIEW));

        EDGES.put(EventStatus.CHANGES_REQUESTED, Map.of(
                EventTransition.SUBMIT, EventStatus.PENDING_REVIEW));

        EDGES.put(EventStatus.PENDING_REVIEW, Map.of(
                EventTransition.WITHDRAW,        EventStatus.DRAFT,
                EventTransition.APPROVE,         EventStatus.APPROVED,
                EventTransition.REJECT,          EventStatus.REJECTED,
                EventTransition.REQUEST_CHANGES, EventStatus.CHANGES_REQUESTED));

        // WITHDRAW out of APPROVED is what stops approval being a trap. Without
        // it an organiser who spots a typo after approval can only publish it
        // wrong or abandon the event, because APPROVED is not editable and had
        // no other way out.
        EDGES.put(EventStatus.APPROVED, Map.of(
                EventTransition.PUBLISH,  EventStatus.PUBLISHED,
                EventTransition.WITHDRAW, EventStatus.DRAFT));

        EDGES.put(EventStatus.PUBLISHED, Map.of(
                EventTransition.TAKE_DOWN, EventStatus.TAKEN_DOWN));

        // REJECTED and TAKEN_DOWN are absent on purpose: terminal.
    }

    /**
     * The target status for a legal transition, or a 409.
     *
     * <p>Returns the target rather than mutating the event so the caller keeps
     * the save in its own transaction, and so this stays testable without a
     * database.
     */
    public EventStatus requireTransition(EventStatus from, EventTransition transition) {
        EventStatus to = EDGES.getOrDefault(from, Map.of()).get(transition);
        if (to == null) {
            throw new InvalidEventStatusTransitionException(from, transition);
        }
        return to;
    }

    /** Whether an edge exists, for UIs deciding which buttons to render. */
    public boolean canTransition(EventStatus from, EventTransition transition) {
        return EDGES.getOrDefault(from, Map.of()).containsKey(transition);
    }

    /**
     * Every action legal from this status, in declaration order.
     *
     * <p>This is what {@code EventResponse.availableActions} is built from, and
     * the reason it exists here rather than in the client: the organiser form's
     * footer and the dashboard's row menu both ask "what can I do with this
     * event", and a copy of the rules in JavaScript would drift from the table
     * above the first time an edge changed.
     */
    public Set<EventTransition> availableTransitions(EventStatus from) {
        Map<EventTransition, EventStatus> edges = EDGES.getOrDefault(from, Map.of());
        // EnumSet so the order is the enum's, not a hash order that would make
        // the buttons move around between responses.
        return edges.isEmpty()
                ? EnumSet.noneOf(EventTransition.class)
                : EnumSet.copyOf(edges.keySet());
    }

    /**
     * Whether the organiser may still change the event's own fields.
     *
     * <p>Excluded are the states where someone else's decision is in flight.
     * PENDING_REVIEW is obvious - an admin is reading it. APPROVED is the one
     * that matters: an
     * editable APPROVED event means approving version A and publishing version
     * B, which defeats review entirely. Changing an approved event costs a
     * WITHDRAW back to DRAFT and a second review, and that is the point.
     *
     * <p>PUBLISHED is deliberately left editable, as it is today. Locking it is
     * a separate question about events that already have sold tickets, and
     * answering it here by accident would be a behaviour change nobody asked
     * for.
     */
    public boolean isEditable(EventStatus status) {
        return status == EventStatus.DRAFT
                || status == EventStatus.CHANGES_REQUESTED
                || status == EventStatus.PUBLISHED;
    }
}
