package com.eventbooking.exception.venue;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * One answer for every way resolving a Google Maps share link can fail.
 *
 * <p>Undifferentiated deliberately. A host that is not Google's, a redirect
 * chain that never lands on /maps, a timeout, a 404 short code - they all mean
 * the same thing where it matters, which is that the organiser's link could not
 * be read and the pin has to be placed by hand. Naming which one also tells an
 * unfriendly caller exactly how the host allowlist behaves.
 */
public class UnreadableMapLinkException extends ApiException {
    public UnreadableMapLinkException() {
        super(ErrorCode.UNREADABLE_MAP_LINK,
                "That Google Maps link could not be read. Open the venue in Google Maps, "
                        + "tap Share, and paste the link it gives you.");
    }
}
