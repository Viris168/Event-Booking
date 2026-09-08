package com.eventbooking.Enumeration;

/**
 * What a gate operator did, as opposed to how it turned out.
 *
 * <p>Separate from {@code ScanOutcome} because the two answer different
 * questions and a single column conflating them cannot be filtered usefully:
 * "show me every UNDO" and "show me every BAD_SIGNATURE" are both things an
 * organiser asks after an event, and one of them is about intent.
 */
public enum GateAction {

    /** One code, one admission - {@code POST /tickets/scan}. */
    SCAN,

    /** One code, a whole party - {@code POST /tickets/scan/group/confirm}. */
    GROUP_CONFIRM,

    /** A check-in reversed. The only gate action that gives a ticket back. */
    UNDO
}
