package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * What someone supplies to open an account with a password.
 *
 * <p>No address is taken here, deliberately. An address typed into a form is a
 * claim and nothing in this product can check it: there is no mail sender, so a
 * slip like {@code gmial.com} would be stored, used as the account's identity,
 * and only discovered by the person who needed it. Worse, it broke the one
 * check that keeps a person to a single account - signing in with Google later
 * matched neither the subject nor the misspelt address, so it minted a second
 * account and split their bookings across the two.
 *
 * <p>An account's address instead arrives from Google when it is linked, which
 * is required before booking anyway. Google refuses to hand back an address it
 * has not verified, so every address on file is one somebody has proved they
 * can read.
 */
public record RegisterRequest(

        /* The account's only identifier at this point, so required. The column
           carries a CHECK constraint, and validating here turns a violation
           into a 400 naming the field rather than a 23514 from Postgres. Both
           spellings are accepted since V24 - people register with the 0 they
           say out loud, not the +855 the column was named for. */
        @NotBlank
        @Pattern(regexp = "^(\\+855|0)[0-9]{8,9}$",
                message = "must be a Cambodian number, e.g. 012345678 or +85512345678")
        @JsonProperty("phone_e164") String phoneE164,

        /* Length only. Composition rules ("one capital, one symbol") push people
           towards predictable substitutions; length is what actually costs an
           attacker time. */
        @NotBlank
        @Size(min = 8, message = "must be at least 8 characters")
        String password,

        @NotBlank
        @JsonProperty("display_name") String displayName
) {
}
