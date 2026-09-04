package com.eventbooking.Enumeration;

/**
 * Which image slot on an event an upload targets. The two roles are separate
 * columns rather than rows in a gallery table (see V12), so this enum is the
 * only place that knows a slot exists.
 */
public enum ImageRole {
    /** Portrait artwork shown on the event page and in search results. */
    COVER,
    /** Wide artwork shown across the top of the listing page. */
    BANNER
}
