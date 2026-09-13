package com.eventbooking.exception.security;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/** Linking refused: this account already has a Google identity, or that Google identity already belongs to another account. Both are 409 and both are answered the same way, because telling a caller which of the two applies tells them whether a stranger's Google account exists here. */
public class GoogleAlreadyLinkedException extends ApiException {
    public GoogleAlreadyLinkedException() {
        super(ErrorCode.GOOGLE_ALREADY_LINKED, "That Google account is already linked to an account here.");
    }
}
