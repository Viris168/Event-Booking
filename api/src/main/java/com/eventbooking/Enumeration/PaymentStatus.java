package com.eventbooking.Enumeration;

import java.util.EnumSet;
import java.util.Set;

/**
 * Mirrors the CHECK on payment_transaction.status.
 *
 * <p>Unlike {@link BookingStatus} this has no transition table: an attempt is
 * opened once and resolved once. What matters is only whether it is still
 * open, because that is the guard that stops a duplicate poll from settling
 * the same attempt twice.
 */
public enum PaymentStatus {

    /** Row written, QR handed to the customer, nothing seen from the provider yet. */
    CREATED,

    /** The provider has acknowledged the attempt but not settled it. */
    PENDING,

    /** Money received. At most one of these per booking - uq_payment_txn_one_success_per_booking. */
    SUCCESS,

    /** The provider declined it. The booking returns to PENDING_PAYMENT so the customer can retry. */
    FAILED,

    /** The customer abandoned this attempt, usually by starting a different one. */
    CANCELLED,

    /** The QR's own clock ran out before anyone paid it. */
    EXPIRED;

    private static final Set<PaymentStatus> OPEN = EnumSet.of(CREATED, PENDING);

    /** True while the attempt can still be settled - i.e. while it is worth polling. */
    public boolean isOpen() {
        return OPEN.contains(this);
    }

    public static Set<PaymentStatus> openStates() {
        return OPEN;
    }
}
