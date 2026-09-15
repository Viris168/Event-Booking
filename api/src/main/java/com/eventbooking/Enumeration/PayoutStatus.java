package com.eventbooking.Enumeration;

/**
 * Where one organiser's settlement request has got to.
 *
 * <p>Three states, and the split between APPROVED and PAID is the one worth
 * defending. They answer different questions - "do we agree we owe this" and
 * "has the money left the platform" - and a bank transfer lives in the gap
 * between them. Collapsing them would force an admin to either claim a payment
 * before making it, or leave an agreed payout indistinguishable from one nobody
 * has looked at.
 *
 * <p>There is deliberately no refused state. An admin who does not intend to
 * pay a request simply does not approve it, and it sits in the queue until
 * somebody deals with it out of band - a request that should never be paid is a
 * conversation with the organiser rather than a row status.
 *
 * <p>PAID is terminal, and so is the event: {@code uq_payout_request_event}
 * allows one payout row per event for all time, so an event is settled exactly
 * once.
 */
public enum PayoutStatus {

    /** The organiser has asked. Nobody has looked yet. */
    REQUESTED,

    /** An admin agrees the platform owes this. The transfer has not been made. */
    APPROVED,

    /** The money left, against {@code paid_reference}. Terminal. */
    PAID
}
