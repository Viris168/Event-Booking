package com.eventbooking.dto.auth;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * What someone supplies to open an account with a password.
 *
 * <p>A phone number and an address are each optional on their own and required
 * together with nothing - one of the two has to be there, because it is the only
 * thing the account can be signed in by afterwards. An account still needs both
 * a number and a linked Google identity before it can book; that is checked at
 * checkout, not here, so that someone can create an account and finish it later
 * rather than being interrogated at the door.
 */
public record RegisterRequest(

        /* Optional, but validated to shape when present. The column carries a
           CHECK constraint, and validating here turns a violation into a 422
           naming the field rather than a 23514 from Postgres. Both spellings are
           accepted since V24 - people register with the 0 they say out loud,
           not the +855 the column was named for. */
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
        @JsonProperty("display_name") String displayName,

        /* Optional, and the second thing an account can be signed in by. Folded
           to lower case on the way in - see V29. */
        @Email String email
) {

    /**
     * One of the two identifiers has to be present.
     *
     * <p>Checked across the fields rather than on either one, because neither is
     * required by itself: the form offers a number or an address and takes
     * whichever the person has. Without this an account could be created that
     * holds a password and nothing to present it with - unreachable by any sign-in
     * path, and holding a display name and a password hash forever.
     */
    @JsonIgnore
    @AssertTrue(message = "either a phone number or an email address is required")
    public boolean isIdentifiable() {
        return (phoneE164 != null && !phoneE164.isBlank())
                || (email != null && !email.isBlank());
    }
}
