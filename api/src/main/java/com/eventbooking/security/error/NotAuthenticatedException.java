package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Thrown when an endpoint needs a caller and does not have one.
 *
 * <p>Normally {@code SecurityConfig}'s rules reject these before a controller
 * runs, so this is the backstop for the gap between "the rules let this through"
 * and "the code assumed a principal" - for example a route that is
 * {@code permitAll} but whose handler still reads the actor. Being explicit
 * turns that gap into a 401 rather than a {@code NullPointerException} rendered
 * as a 500.
 */
public class NotAuthenticatedException extends ApiException {
    public NotAuthenticatedException() {
        super(ErrorCode.NOT_AUTHENTICATED, "Sign in to continue.");
    }
}
