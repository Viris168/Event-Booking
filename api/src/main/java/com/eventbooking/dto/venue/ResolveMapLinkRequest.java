package com.eventbooking.dto.venue;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A Google Maps share link the organiser pasted into the venue form.
 *
 * <p>Only the short {@code maps.app.goo.gl} form ever reaches the server. A
 * full URL already carries its coordinates, so the browser reads those itself
 * and never makes this call.
 */
public record ResolveMapLinkRequest(
        @NotBlank
        // Long enough for any real Maps URL, short enough that nothing large is
        // being handed to a service whose job is to make an outbound request.
        @Size(max = 2048)
        String url
) {
}
