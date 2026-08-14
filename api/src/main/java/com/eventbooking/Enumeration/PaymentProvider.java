package com.eventbooking.Enumeration;

/**
 * Mirrors the CHECK on payment_transaction.provider (and on
 * payment_webhook_event.provider). Adding a value here means adding it to both
 * constraints in a new migration.
 */
public enum PaymentProvider {

    /** Bakong KHQR, settled by polling - see the payment package. */
    BAKONG_KHQR,

    /** ABA PayWay redirect. Not implemented yet; the enum value exists so the
     *  column, the DTOs and the web's provider switch already line up. */
    ABA_PAYWAY
}
