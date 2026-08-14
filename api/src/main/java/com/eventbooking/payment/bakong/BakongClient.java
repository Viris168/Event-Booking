package com.eventbooking.payment.bakong;

/**
 * The one thing this integration needs from Bakong: has this QR been paid?
 *
 * <p>Bakong's open API offers no callback for the accounts this platform uses,
 * so settlement is discovered by asking - see {@code PaymentReconciler}.
 * Implementations must be safe to call repeatedly with the same md5; the call
 * is a read on the provider's side and the whole design leans on that.
 */
public interface BakongClient {

    /**
     * @param md5 md5 of the KHQR payload, stored as
     *            {@code payment_transaction.provider_ref}
     * @return never null - a provider that cannot be reached comes back as
     *         {@link BakongCheckResult.Outcome#UNAVAILABLE} rather than an
     *         exception, because "we do not know yet" is a normal, expected
     *         answer for a poller and must not abort the rest of the sweep
     */
    BakongCheckResult checkByMd5(String md5);
}
