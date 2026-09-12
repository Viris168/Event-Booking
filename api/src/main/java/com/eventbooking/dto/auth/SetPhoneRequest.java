package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * The phone number a Google account adds after its first sign-in.
 *
 * <p>Same pattern as {@link RegisterRequest}: the column carries a CHECK
 * constraint, and validating here turns a violation into a 422 naming the field
 * rather than a 23514 from Postgres.
 */
public record SetPhoneRequest(

        @NotBlank
        @Pattern(regexp = "^\\+855[0-9]{8,9}$",
                message = "must be a Cambodian E.164 number, e.g. +85512345678")
        @JsonProperty("phone_e164") String phoneE164) {
}
