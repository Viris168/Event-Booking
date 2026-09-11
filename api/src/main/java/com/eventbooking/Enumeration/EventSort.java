package com.eventbooking.Enumeration;

/** The orderings the public catalogue offers. */
public enum EventSort {

    /** Next one on first. The default, and what an empty catalogue search means. */
    SOONEST,

    /** Cheapest "from" price first. */
    PRICE_LOW,

    /** Dearest "from" price first. */
    PRICE_HIGH;

    /**
     * Read the events page's {@code sort} query parameter.
     *
     * <p>Anything unrecognised falls back to {@link #SOONEST} instead of
     * failing the request. The home page's carousel already sends
     * {@code sort=startsAt,asc} - Spring's own Sort syntax, from before this
     * parameter meant anything - and a catalogue read is not worth a 400 over
     * a word it does not know.
     */
    public static EventSort fromParam(String value) {
        if (value == null) return SOONEST;
        return switch (value.trim()) {
            case "priceLow" -> PRICE_LOW;
            case "priceHigh" -> PRICE_HIGH;
            default -> SOONEST;
        };
    }
}
