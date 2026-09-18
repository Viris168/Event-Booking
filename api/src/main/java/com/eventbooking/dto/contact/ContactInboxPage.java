package com.eventbooking.dto.contact;

import java.util.List;
import java.util.Map;

/**
 * A page of the admin inbox, with the tab counts that go above it.
 *
 * <p>The counts travel with the page rather than from a second endpoint because
 * they are what the screen renders first: the tabs are how an admin decides
 * which page to ask for, so fetching them separately means the tabs are blank
 * for exactly as long as it takes to make a second round trip.
 *
 * <p>{@code countsByStatus} is keyed by {@link com.eventbooking.Enumeration
 * .ContactMessageStatus} name and always carries every status, including the
 * zeros. The repository omits empty statuses - see
 * {@link com.eventbooking.repository.ContactMessageRepository
 * #countGroupedByStatus()} - and the service fills them, so the client can
 * render a tab row without testing each key for absence.
 */
public record ContactInboxPage(

        List<ContactMessageResponse> items,

        /** Zero-based, matching the page number the caller asked for. */
        int page,
        int size,

        /** Across the whole filtered set, not just this page. */
        long totalItems,
        int totalPages,

        /** Every status name to its count. Zeros included. */
        Map<String, Long> countsByStatus
) {
}
