package com.eventbooking.exception.contact;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

import java.util.Map;

/**
 * The contact form has been used too often, from one address or by one sender.
 *
 * <p>The counterpart to {@link com.eventbooking.exception.security
 * .TooManyLoginAttemptsException}, and a much blunter instrument. That one
 * counts only FAILURES, because a successful sign-in is not an attack. This one
 * has no equivalent signal: every submission "succeeds", so the only thing
 * available to count is how many there have been.
 *
 * <p>Which means, unavoidably, that a legitimate sender with a great deal to
 * say can trip it. The limits are set generously for exactly that reason - see
 * {@code app.contact.rate-limit} - and the message says when to come back
 * rather than implying they did something wrong.
 *
 * <p>Retryable, and {@code retry_after_seconds} is how long.
 */
public class TooManyContactMessagesException extends ApiException {

    public TooManyContactMessagesException(long retryAfterSeconds) {
        super(ErrorCode.TOO_MANY_CONTACT_MESSAGES,
                "Thanks - we already have your message. Please give us "
                        + Math.max(1, (retryAfterSeconds + 59) / 60)
                        + " minute(s) before sending another.",
                true,
                Map.of("retry_after_seconds", retryAfterSeconds));
    }
}
