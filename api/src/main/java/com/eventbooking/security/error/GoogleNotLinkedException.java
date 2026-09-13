package com.eventbooking.security.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/** Unlinking something that was never linked. Its own code rather than a silent success: the client asked for a state change that did not happen, and a 204 would let a broken UI keep offering the button. */
public class GoogleNotLinkedException extends ApiException {
    public GoogleNotLinkedException() {
        super(ErrorCode.GOOGLE_NOT_LINKED, "This account has no Google sign-in to remove.");
    }
}
