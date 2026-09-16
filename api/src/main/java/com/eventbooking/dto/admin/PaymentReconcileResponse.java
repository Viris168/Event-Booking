package com.eventbooking.dto.admin;

/**
 * What came of asking the provider about one attempt.
 *
 * <p>Carries the refreshed row so the table can update in place rather than
 * reloading every attempt to show one changed status - and so the admin can see
 * what the answer was, which is the entire reason for pressing the button.
 */
public record PaymentReconcileResponse(
        /**
         * Whether the provider was actually contacted.
         *
         * <p>False is a normal outcome, not an error. The attempt may have
         * closed between the table being drawn and the button being pressed, or
         * the per-provider rate floor may say it is too soon to ask again - a
         * Bakong account can be capped at 100 checks a DAY, so "ask again in a
         * moment" is a real answer and the admin has to be told it rather than
         * shown an unchanged row and left guessing.
         */
        boolean checked,

        /** The attempt as it stands now, checked or not. */
        AdminPaymentResponse payment
) {
}
