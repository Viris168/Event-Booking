package com.eventbooking.booking;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Generates booking_ref, the code a customer reads out over the phone.
 *
 * Crockford base32, which already omits the ambiguous I, L, O and U, so a
 * support agent never has to ask "was that a one or an el?". Ten characters
 * over a 32-symbol alphabet is 50 bits, which puts the odds of a collision
 * beyond negligible for this platform's volumes - so there is no retry loop,
 * and booking_ref's UNIQUE constraint stays a pure backstop.
 *
 * Not derived from the booking id: a sequential ref would let anyone holding
 * one ticket enumerate the others.
 */
@Component
public class BookingRefGenerator {

    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final int LENGTH = 10;
    private static final String PREFIX = "KH-";

    private final SecureRandom random = new SecureRandom();

    public String generate() {
        StringBuilder sb = new StringBuilder(PREFIX.length() + LENGTH);
        sb.append(PREFIX);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
