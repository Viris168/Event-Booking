package com.eventbooking.dto.booking;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Turns an active hold into a booking. Everything priced is taken from the
 * hold itself - the client sends only who the tickets are for, so a tampered
 * request cannot alter what is owed.
 */
public record CheckoutRequest(
        @JsonProperty("hold_id") @NotNull Long holdId,

        @JsonProperty("buyer_name") @NotBlank String buyerName,

        /* Mirrors the CHECK on booking.buyer_phone_e164 so a bad number is a
           422 from validation rather than a 23514 from Postgres. */
        @NotBlank
        @Pattern(regexp = "^\\+855[0-9]{8,9}$", message = "must be a Cambodian E.164 number, e.g. +85512345678")
        @JsonProperty("buyer_phone_e164") String buyerPhoneE164,

        @JsonProperty("buyer_email") @Email String buyerEmail
) {
}
