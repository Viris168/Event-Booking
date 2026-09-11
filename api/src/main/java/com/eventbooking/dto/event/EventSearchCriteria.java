package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.EventSort;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

/**
 * What the catalogue is being narrowed to. Every field is nullable and a null
 * one means "do not filter on this", which is what lets one query serve both
 * plain browsing and a fully specified search.
 *
 * <p>The values here are already in the shapes the query wants - a lowercased
 * LIKE pattern, instants, cents - so the repository holds no parsing and the
 * controller holds no query logic.
 */
public record EventSearchCriteria(

        /** Lowercased, escaped and {@code %}-wrapped, ready to bind. Null when no text was typed. */
        String titleLike,

        String provinceCode,

        /** Inclusive lower bound on {@code startsAt}. */
        Instant startsFrom,

        /** Exclusive upper bound on {@code startsAt} - the instant the "to" day ends. */
        Instant startsBefore,

        Integer minPriceCents,
        Integer maxPriceCents,
        EventSort sort
) {

    /**
     * The catalogue is Cambodian and so are the dates in its filter. Without a
     * fixed zone here, "from 10 September" would be read as UTC midnight and
     * quietly drop the first seven hours of the day - every event starting
     * before 07:00 local on the boundary date.
     */
    private static final ZoneId CAMBODIA = ZoneId.of("Asia/Phnom_Penh");

    /** Escapes {@code %} and {@code _} in user text so they match literally. */
    private static final char LIKE_ESCAPE = '!';

    /**
     * Build criteria from raw query-string values.
     *
     * <p>Everything arrives as a String and every parse is lenient: blanks and
     * malformed values become "no filter" rather than a 400. The events page
     * keeps all six filters in the URL and sends the empty ones as empty
     * strings, so strictness here would turn an untouched filter bar into a
     * failed catalogue read.
     */
    public static EventSearchCriteria of(String q,
                                         String province,
                                         String from,
                                         String to,
                                         String minUsd,
                                         String maxUsd,
                                         String sort) {
        LocalDate fromDate = parseDate(from);
        LocalDate toDate = parseDate(to);
        return new EventSearchCriteria(
                likePattern(q),
                trimToNull(province),
                fromDate == null ? null : fromDate.atStartOfDay(CAMBODIA).toInstant(),
                // Exclusive, so the whole "to" day is included whatever time of
                // day the events on it start.
                toDate == null ? null : toDate.plusDays(1).atStartOfDay(CAMBODIA).toInstant(),
                cents(parseDecimal(minUsd)),
                cents(parseDecimal(maxUsd)),
                EventSort.fromParam(sort));
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * {@code %term%}, lowercased for a case-insensitive match and with the
     * wildcards a user typed neutralised - otherwise searching for "50_off"
     * matches "50 off", "50-off" and every other single character in between.
     */
    private static String likePattern(String q) {
        String term = trimToNull(q);
        if (term == null) return null;
        String escaped = term.toLowerCase()
                .replace(String.valueOf(LIKE_ESCAPE), LIKE_ESCAPE + "" + LIKE_ESCAPE)
                .replace("%", LIKE_ESCAPE + "%")
                .replace("_", LIKE_ESCAPE + "_");
        return "%" + escaped + "%";
    }

    private static LocalDate parseDate(String value) {
        String raw = trimToNull(value);
        if (raw == null) return null;
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static BigDecimal parseDecimal(String value) {
        String raw = trimToNull(value);
        if (raw == null) return null;
        try {
            return new BigDecimal(raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Dollars to cents, clamped to what the column can hold. A price typed with
     * more digits than an int can carry is a typo, not a request worth a 500.
     */
    private static Integer cents(BigDecimal usd) {
        if (usd == null) return null;
        BigDecimal exact = usd.movePointRight(2).setScale(0, RoundingMode.HALF_UP);
        if (exact.compareTo(BigDecimal.ZERO) < 0) return 0;
        if (exact.compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0) return Integer.MAX_VALUE;
        return exact.intValue();
    }
}
