package com.eventbooking.dto.venue;

/**
 * Where a short Maps link actually pointed.
 *
 * <p>The URL, not a coordinate pair: parsing lives once in the frontend's
 * lib/mapLink.js, which handles this string identically to one the organiser
 * pasted in full. See {@link com.eventbooking.service.Venue.MapLinkResolver}
 * for why that split is deliberate.
 */
public record ResolvedMapLinkResponse(
        String resolvedUrl
) {
}
