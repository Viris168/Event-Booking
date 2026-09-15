package com.eventbooking.Enumeration;

/**
 * The booking state machine. Must stay in sync with the CHECK constraint
 * on booking.state in V1__schema.sql.
 *
 * NOTE: HELD is NOT a booking state - it belongs to hold.status
 * (ACTIVE / CONSUMED / EXPIRED / RELEASED). A booking only exists once a
 * hold has been converted, so it starts at PENDING_PAYMENT.
 *
 * Owner: Winner (Booking & Payments). Transitions are enforced in
 * BookingStateMachine, not by scattered if-statements.
 */
public enum BookingStatus {
    PENDING_PAYMENT,
    AWAITING_CONFIRMATION,
    PAYMENT_FAILED,
    /**
     * Paid, and terminal. There is no refund path: the platform does not
     * reverse a settled booking, so nothing follows CONFIRMED.
     */
    CONFIRMED,
    EXPIRED,
    CANCELLED
}
