package com.eventbooking.dto.booking;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Turns an active hold into a booking. Everything priced is taken from the
 * hold itself - the client sends only who the tickets are for, so a tampered
 * request cannot alter what is owed.
 */
public record CheckoutRequest(
        @NotNull Long holdId,

        @NotBlank String buyerName,

        /* Mirrors the CHECK on booking.buyer_phone_e164 so a bad number is a
           422 from validation rather than a 23514 from Postgres. */
        @NotBlank
        @Pattern(regexp = "^\\+855[0-9]{8,9}$", message = "must be a Cambodian E.164 number, e.g. +85512345678")
        String buyerPhoneE164,

        @Email String buyerEmail
) {
}
