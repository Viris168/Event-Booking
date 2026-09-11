package com.eventbooking.catalog;

import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.EventSearchCriteria;
import com.eventbooking.service.event.EventService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The public catalogue's filters, against a real Postgres.
 *
 * <p>Not a unit test, and it cannot be one: the whole feature is a single JPQL
 * query, so what needs proving is that Hibernate parses it and Postgres answers
 * it correctly - {@code least} across the two pricing tables, {@code nulls
 * last} on a CASE sort key, and the count query Spring Data derives for the
 * page. None of that runs without a database.
 *
 * <p>Each test seeds its own catalogue from an empty {@code event} table, so
 * the counts below are exact rather than "at least".
 */
@SpringBootTest
@Testcontainers
class EventSearchIT {

    // The chained withX() calls hand back a different reference than the
    // allocation, which reads as a leak to the compiler's resource analysis.
    // @Testcontainers owns this container's lifecycle and stops it after the class.
    @SuppressWarnings("resource")
    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("event_booking_test")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.jpa.show-sql", () -> "false");
        // Without a dev profile TicketSecretGuard runs for real, and on a fresh
        // clone with no .env it would reject the repo's placeholder key and
        // fail this whole class in the context load.
        registry.add("app.ticket.signing-secret", () -> "event-search-it-signing-secret-32-chars");
    }

    /** ISO 3166-2:KH codes, seeded by V17. */
    private static final String PHNOM_PENH = "12";
    private static final String SIEM_REAP = "17";

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired
    private EventService eventService;

    @Autowired
    private JdbcTemplate jdbc;

    /**
     * Three published events and one draft.
     *
     * <p>They differ in every dimension the filter bar can narrow by, and the
     * three orderings they produce are all distinct - so a sort assertion that
     * passes by coincidence is not possible:
     *
     * <pre>
     *   Jazz Evening   Siem Reap    in  5 days   zone only        from $10
     *   Rock Night     Phnom Penh   in 10 days   seat class only  from $25
     *   Khmer New Year Phnom Penh   in 20 days   both tables      from  $5
     * </pre>
     */
    @BeforeEach
    void seedCatalogue() {
        // Exact counts below depend on this being the whole catalogue.
        jdbc.update("DELETE FROM event");

        int n = SEQ.incrementAndGet();
        long organizerUserId = insertId(
                "INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                        + "VALUES (?, ?, 'x', 'Organizer', 'ORGANIZER') RETURNING id",
                phone(n), "organizer" + n + "@example.com");
        long organizerId = insertId(
                "INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) "
                        + "VALUES (?, 'Acme', 'Acme') RETURNING id",
                organizerUserId);

        long diamondIsland = insertVenue(organizerId, "Diamond Island", PHNOM_PENH);
        long angkorArena = insertVenue(organizerId, "Angkor Arena", SIEM_REAP);

        long jazz = insertEvent(organizerId, angkorArena, "Jazz Evening", "ជាស", 5, "PUBLISHED");
        insertZone(jazz, 1000);

        long rock = insertEvent(organizerId, diamondIsland, "Rock Night", "រ៉ុក", 10, "PUBLISHED");
        insertSeatClass(rock, 2500);

        // Priced in both tables, cheapest in the zone one - the case a query
        // that looked at seat_class alone would price at $50 instead of $5.
        long newYear = insertEvent(organizerId, diamondIsland, "Khmer New Year", "បុណ្យចូលឆ្នាំ", 20, "PUBLISHED");
        insertSeatClass(newYear, 5000);
        insertZone(newYear, 500);

        insertEvent(organizerId, diamondIsland, "Secret Show", "សម្ងាត់", 15, "DRAFT");
    }

    // ------------------------------------------------------------------
    // Browsing
    // ------------------------------------------------------------------

    @Test
    void listsPublishedEventsSoonestFirstAndHidesDrafts() {
        assertThat(titles(search(criteria(null, null, null, null, null, null, "soonest"))))
                .containsExactly("Jazz Evening", "Rock Night", "Khmer New Year");
    }

    @Test
    void paginatesOnTheServer() {
        Page<EventResponse> first = eventService.listEvents(
                criteria(null, null, null, null, null, null, "soonest"), 0, 2);

        assertThat(first.getTotalElements()).isEqualTo(3);
        assertThat(first.getTotalPages()).isEqualTo(2);
        assertThat(titles(first.getContent())).containsExactly("Jazz Evening", "Rock Night");

        Page<EventResponse> second = eventService.listEvents(
                criteria(null, null, null, null, null, null, "soonest"), 1, 2);
        assertThat(titles(second.getContent())).containsExactly("Khmer New Year");
    }

    // ------------------------------------------------------------------
    // Text
    // ------------------------------------------------------------------

    @Test
    void matchesTitleCaseInsensitivelyAndOnPartialWords() {
        assertThat(titles(search(q("rOcK nI")))).containsExactly("Rock Night");
    }

    @Test
    void matchesTheVenueName() {
        // "Search events, artists or venues" - the placeholder promises this.
        assertThat(titles(search(q("angkor")))).containsExactly("Jazz Evening");
    }

    @Test
    void matchesKhmerTitles() {
        // Why the search is a substring match and not Postgres full text:
        // there is no Khmer text-search configuration, and Khmer does not
        // space its words, so to_tsvector would make one token of the phrase
        // and this would find nothing.
        assertThat(titles(search(q("ចូលឆ្នាំ")))).containsExactly("Khmer New Year");
    }

    @Test
    void treatsLikeWildcardsInTheQueryAsLiteralText() {
        // Unescaped, "_" matches any single character and this returns the
        // entire catalogue.
        assertThat(search(q("_"))).isEmpty();
        assertThat(search(q("%"))).isEmpty();
    }

    @Test
    void returnsNothingRatherThanEverythingWhenNothingMatches() {
        assertThat(search(q("ryanair"))).isEmpty();
    }

    // ------------------------------------------------------------------
    // Province and dates
    // ------------------------------------------------------------------

    @Test
    void filtersByProvince() {
        assertThat(titles(search(criteria(null, SIEM_REAP, null, null, null, null, null))))
                .containsExactly("Jazz Evening");
    }

    @Test
    void filtersByDateRangeInclusiveOfBothEndDays() {
        // Rock Night is exactly 10 days out; a range that ends on its day must
        // include it however late in the day it starts.
        String from = localDate(7);
        String to = localDate(10);

        assertThat(titles(search(criteria(null, null, from, to, null, null, null))))
                .containsExactly("Rock Night");
    }

    // ------------------------------------------------------------------
    // Price - the "from" price the cards print, across both pricing tables
    // ------------------------------------------------------------------

    @Test
    void filtersByMaximumFromPrice() {
        assertThat(titles(search(criteria(null, null, null, null, null, "12", null))))
                .containsExactly("Jazz Evening", "Khmer New Year");
    }

    @Test
    void filtersByMinimumFromPrice() {
        // Khmer New Year has a $50 tier, but its "from" price is $5 - the
        // number on its card - so it is not an event "from $20 up".
        assertThat(titles(search(criteria(null, null, null, null, "20", null, null))))
                .containsExactly("Rock Night");
    }

    @Test
    void readsDecimalPricesAsCents() {
        // $9.99 is below Jazz Evening's $10.00 and above Khmer New Year's $5.
        assertThat(titles(search(criteria(null, null, null, null, null, "9.99", null))))
                .containsExactly("Khmer New Year");
    }

    @Test
    void sortsByFromPriceAscending() {
        assertThat(titles(search(criteria(null, null, null, null, null, null, "priceLow"))))
                .containsExactly("Khmer New Year", "Jazz Evening", "Rock Night");
    }

    @Test
    void sortsByFromPriceDescending() {
        assertThat(titles(search(criteria(null, null, null, null, null, null, "priceHigh"))))
                .containsExactly("Rock Night", "Jazz Evening", "Khmer New Year");
    }

    @Test
    void sortsEventsWithNoPricingLastRatherThanFirst() {
        long organizerId = jdbc.queryForObject("SELECT organizer_id FROM event LIMIT 1", Long.class);
        long venueId = jdbc.queryForObject("SELECT venue_id FROM event LIMIT 1", Long.class);
        insertEvent(organizerId, venueId, "Unpriced", "គ្មានតម្លៃ", 1, "PUBLISHED");

        // Descending is the direction that gets this wrong by default: Postgres
        // sorts nulls first on DESC, which would put the event with no tickets
        // at the top of "most expensive".
        assertThat(titles(search(criteria(null, null, null, null, null, null, "priceHigh"))))
                .containsExactly("Rock Night", "Jazz Evening", "Khmer New Year", "Unpriced");

        // ...and no price filter matches it at all.
        assertThat(titles(search(criteria(null, null, null, null, "0", null, null))))
                .doesNotContain("Unpriced");
    }

    // ------------------------------------------------------------------
    // Input the filter bar actually sends
    // ------------------------------------------------------------------

    @Test
    void treatsBlankAndUnparseableFiltersAsNoFilterAtAll() {
        // What an untouched filter bar puts on the wire, plus a sort value the
        // home page still sends from before this parameter meant anything.
        List<EventResponse> results = search(
                EventSearchCriteria.of("  ", "", "", "  ", "", "not-a-number", "startsAt,asc"));

        assertThat(titles(results)).containsExactly("Jazz Evening", "Rock Night", "Khmer New Year");
    }

    @Test
    void combinesEveryFilterAtOnce() {
        List<EventResponse> results = search(EventSearchCriteria.of(
                "night", PHNOM_PENH, localDate(0), localDate(30), "10", "30", "priceLow"));

        assertThat(titles(results)).containsExactly("Rock Night");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private List<EventResponse> search(EventSearchCriteria criteria) {
        return eventService.listEvents(criteria, 0, 20).getContent();
    }

    private static EventSearchCriteria q(String text) {
        return criteria(text, null, null, null, null, null, null);
    }

    private static EventSearchCriteria criteria(String q, String province, String from, String to,
                                                String minUsd, String maxUsd, String sort) {
        return EventSearchCriteria.of(q, province, from, to, minUsd, maxUsd, sort);
    }

    private static List<String> titles(List<EventResponse> events) {
        return events.stream().map(EventResponse::titleEn).toList();
    }

    private long insertVenue(long organizerId, String name, String provinceCode) {
        return insertId(
                "INSERT INTO venue (organizer_id, name_en, name_km, province_code, khan_district, "
                        + "sangkat_commune, street_address) VALUES (?, ?, ?, ?, 'Chamkarmon', 'Tonle Bassac', '#1') "
                        + "RETURNING id",
                organizerId, name, name, provinceCode);
    }

    private long insertEvent(long organizerId, long venueId, String titleEn, String titleKm,
                             int daysOut, String status) {
        return insertId(
                "INSERT INTO event (organizer_id, venue_id, inventory_mode, slug, title_en, title_km, status, "
                        + "starts_at, doors_open_at, sales_open_at, sales_close_at) "
                        + "VALUES (?, ?, 'MIXED', ?, ?, ?, ?, "
                        + "now() + (? || ' days')::interval, now() + (? || ' days')::interval, "
                        + "now() - interval '1 day', now() + interval '1 day') RETURNING id",
                organizerId, venueId, slug(titleEn), titleEn, titleKm, status, daysOut, daysOut);
    }

    private void insertSeatClass(long eventId, int priceCents) {
        jdbc.update("INSERT INTO seat_class (event_id, name_en, name_km, price_usd_cents) "
                + "VALUES (?, 'Zone A', 'Zone A', ?)", eventId, priceCents);
    }

    private void insertZone(long eventId, int priceCents) {
        jdbc.update("INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity) "
                + "VALUES (?, 'GA Floor', 'GA Floor', ?, 100)", eventId, priceCents);
    }

    /** The date {@code daysOut} days from now, as the filter bar's date input writes it. */
    private String localDate(int daysOut) {
        return jdbc.queryForObject(
                "SELECT to_char((now() + (? || ' days')::interval) AT TIME ZONE 'Asia/Phnom_Penh', 'YYYY-MM-DD')",
                String.class, daysOut);
    }

    private long insertId(String sql, Object... args) {
        Long id = jdbc.queryForObject(sql, Long.class, args);
        assertThat(id).as("insert did not return an id: %s", sql).isNotNull();
        return id;
    }

    private static String slug(String titleEn) {
        return titleEn.toLowerCase().replace(' ', '-') + "-" + SEQ.get();
    }

    /** A distinct valid Cambodian E.164 number per seeded user. */
    private static String phone(int n) {
        return String.format("+8552%07d", n % 10_000_000);
    }
}
