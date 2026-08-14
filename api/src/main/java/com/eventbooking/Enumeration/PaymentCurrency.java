package com.eventbooking.Enumeration;

/**
 * Mirrors the CHECK on payment_transaction.currency_charged.
 *
 * <p>Every booking carries both a USD and a KHR total (the FX rate is
 * snapshotted at checkout), so this records which of the two the customer was
 * actually asked for. It also drives the KHQR payload: EMVCo tag 53 wants the
 * ISO 4217 numeric code, and the minor-unit count decides how the amount in
 * tag 54 is formatted - riel is a whole-number currency.
 */
public enum PaymentCurrency {

    USD("840", 2),
    KHR("116", 0);

    private final String numericCode;
    private final int minorUnits;

    PaymentCurrency(String numericCode, int minorUnits) {
        this.numericCode = numericCode;
        this.minorUnits = minorUnits;
    }

    /** ISO 4217 numeric code, as EMVCo tag 53 expects it. */
    public String numericCode() {
        return numericCode;
    }

    /** Decimal places the provider expects in the amount field. */
    public int minorUnits() {
        return minorUnits;
    }
}
