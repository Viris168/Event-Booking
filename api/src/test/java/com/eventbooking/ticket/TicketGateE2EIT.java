package com.eventbooking.ticket;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.model.Booking;
import com.eventbooking.model.Ticket;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.ScanLogRepository;
import com.eventbooking.repository.TicketRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Map;

import com.eventbooking.dto.booking.CheckoutRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The whole gate, end to end, over real HTTP against a real Postgres.
 *
 * <p>Everything below it is unit-tested with mocks, which proves the logic and
 * proves nothing about the wiring: whether the JSON field really serialises as
 * {@code event_id}, whether the QR endpoint really returns SVG, whether a
 * payload minted by the codec really survives a round trip through Jackson and
 * a URL and comes back decodable. Those are the failures that only ever appear
 * at a door.
 *
 * <p><b>Database.</b> Starts its own {@code postgres:16-alpine} through
 * Testcontainers, like the other two ITs, so CI needs no {@code services:}
 * block and a fresh clone needs no setup.
 *
 * <p>Set {@code E2E_DB_URL} to point it at an already-running Postgres instead -
 * the docker-compose one, say. That skips a container start per run, which
 * matters when iterating on the test itself. Never aim it at the dev database:
 * this suite buys tickets and spends them.
 *
 * <p>Ordered, because it is one story rather than eight independent facts: a
 * ticket has to be bought before it can be scanned, and spent before a scan of
 * it can be refused.
 */
@SpringBootTest
@ActiveProfiles("dev")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class TicketGateE2EIT {

    /** An already-running Postgres to borrow, or null to start one. */
    private static final String EXTERNAL_DB = System.getenv("E2E_DB_URL");

    /**
     * Started here rather than under {@code @Testcontainers} because it is
     * conditional: the annotation manages a field it assumes always exists, and
     * a null @Container is a lifecycle error rather than a skipped container.
     * Ryuk stops it when the JVM exits.
     */
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer<?> POSTGRES;

    static {
        if (EXTERNAL_DB == null) {
            POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("event_booking_gate_e2e")
                    .withUsername("test")
                    .withPassword("test");
            POSTGRES.start();
        } else {
            POSTGRES = null;
        }
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        if (POSTGRES != null) {
            registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
            registry.add("spring.datasource.username", POSTGRES::getUsername);
            registry.add("spring.datasource.password", POSTGRES::getPassword);
        } else {
            registry.add("spring.datasource.url", () -> EXTERNAL_DB);
            registry.add("spring.datasource.username",
                    () -> System.getenv().getOrDefault("E2E_DB_USER", "postgres"));
            registry.add("spring.datasource.password",
                    () -> System.getenv().getOrDefault("E2E_DB_PASSWORD", "postgres"));
        }
        registry.add("spring.jpa.show-sql", () -> "false");
        // Pinned so a signature is verified against a known key rather than
        // whatever the environment happens to export.
        registry.add("app.ticket.signing-secret",
                () -> "gate-e2e-signing-secret-at-least-32-chars");
    }

    /** The customer who buys, and the organiser who owns the gate. */
    private static final java.util.Map<Long, Long> buyerIds = new java.util.HashMap<>();
    /**
     * Identities are unique per RUN, not just per test. app_user.phone_e164 is
     * UNIQUE and this suite leaves its rows behind on purpose - they are the
     * evidence - so a fixed counter collides the second time it is run.
     */
    private static final java.util.concurrent.atomic.AtomicInteger SEQ =
            new java.util.concurrent.atomic.AtomicInteger(
                    (int) (System.currentTimeMillis() % 900_000) * 4);

    @Autowired WebApplicationContext context;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired com.eventbooking.service.hold.HoldService holdService;
    @Autowired com.eventbooking.booking.BookingService bookingService;
    @Autowired TicketService ticketService;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    @Autowired BookingRepository bookingRepository;
    @Autowired TicketRepository ticketRepository;
    @Autowired EventRepository eventRepository;
    @Autowired OrganizerProfileRepository organizerProfileRepository;
    @Autowired ScanLogRepository scanLogRepository;

    private static final ObjectMapper JSON = new ObjectMapper();

    private MockMvc mvc;

    // Carried between the ordered steps below.
    private static Long eventId;
    private static String operator;
    private static Long soloBookingId;
    private static Long partyBookingId;
    private static String soloPayload;
    private static List<String> partyPayloads;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context).build();
        }
        return mvc;
    }

    // ==================================================================
    // 1. A ticket exists at all
    // ==================================================================

    @Test
    @Order(1)
    void aConfirmedBookingIsIssuedOneTicketPerAdmissionUnit() {
        // Real inventory, a real hold, a real checkout. Tickets are then issued
        // the only way they ever are - by a booking reaching CONFIRMED.
        Fixture f = seedEventWithZone();
        eventId = f.eventId();
        operator = String.valueOf(f.organizerUserId());

        soloBookingId = buyZone(f, 1);
        partyBookingId = buyZone(f, 3);

        assertThat(bookingRepository.findById(soloBookingId).orElseThrow().getState())
                .isEqualTo(BookingStatus.CONFIRMED);
        assertThat(ticketRepository.findByBookingId(soloBookingId)).hasSize(1);
        assertThat(ticketRepository.findByBookingId(partyBookingId))
                .as("a zone line of 3 is three separately scannable tickets")
                .hasSize(3);
    }

    private record Fixture(long eventId, long zoneId, long organizerUserId, long buyerId) {}

    /** One private event with a GA zone, so the tests cannot collide. */
    private Fixture seedEventWithZone() {
        int n = SEQ.incrementAndGet();
        jdbc.update("INSERT INTO province_ref (code, name_en, name_km) VALUES ('PP','Phnom Penh','PP') "
                + "ON CONFLICT (code) DO NOTHING");

        long organizerUserId = insertId("INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                + "VALUES (?, ?, 'x', 'Gate Organizer', 'ORGANIZER') RETURNING id",
                "+8559" + String.format("%07d", (n * 2) % 10_000_000), "gate-org" + n + "@e2e.test");
        long buyerId = insertId("INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                + "VALUES (?, ?, 'x', 'Gate Customer', 'CUSTOMER') RETURNING id",
                "+8559" + String.format("%07d", (n * 2 + 1) % 10_000_000), "gate-cust" + n + "@e2e.test");
        long organizerId = insertId("INSERT INTO organizer_profile (user_id, org_name_en, org_name_km) "
                + "VALUES (?, 'Gate Co', 'Gate Co') RETURNING id", organizerUserId);
        long venueId = insertId("INSERT INTO venue (organizer_id, name_en, name_km, province_code, "
                + "khan_district, sangkat_commune, street_address) "
                + "VALUES (?, 'Arena', 'Arena', 'PP', 'Chamkarmon', 'Tonle Bassac', '#1') RETURNING id", organizerId);
        // PUBLISHED with an open sales window: HoldService.requireOnSale demands
        // all three, and a DRAFT event refuses the hold this test is built on.
        long ev = insertId("INSERT INTO event (organizer_id, venue_id, inventory_mode, status, slug, "
                + "title_en, title_km, starts_at, doors_open_at, sales_open_at, sales_close_at) "
                + "VALUES (?, ?, 'ZONED', 'PUBLISHED', ?, 'Gate Test', 'Gate Test', "
                + "now() + interval '2 days', now() + interval '2 days', "
                + "now() - interval '1 day', now() + interval '1 day') RETURNING id",
                organizerId, venueId, "gate-test-" + n);
        long zone = insertId("INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity) "
                + "VALUES (?, 'GA Floor', 'GA Floor', 1000, 100) RETURNING id", ev);

        return new Fixture(ev, zone, organizerUserId, buyerId);
    }

    /** Hold -> checkout -> CONFIRMED, which is what issues the tickets. */
    private Long buyZone(Fixture f, int qty) {
        long buyer = insertId("INSERT INTO app_user (phone_e164, email, password_hash, display_name, role) "
                + "VALUES (?, ?, 'x', 'Buyer', 'CUSTOMER') RETURNING id",
                "+8559" + String.format("%07d", SEQ.incrementAndGet() % 10_000_000),
                "buyer" + SEQ.get() + "@e2e.test");

        var hold = holdService.createHold(f.eventId(), List.of(), Map.of(f.zoneId(), qty), buyer);
        Booking booking = bookingService.convertHold(
                new CheckoutRequest(hold.id(), "Gate Buyer", "+85512345678", null), buyer);
        buyerIds.put(booking.getId(), buyer);

        // The exact path a settled payment walks. The state machine refuses
        // PENDING_PAYMENT -> CONFIRMED directly, and AWAITING_CONFIRMATION in
        // between is the point: it is what a real gateway does.
        //
        // Confirm and issue share ONE transaction, exactly as PaymentService
        // does - issuing outside it cannot even read booking.items, which is
        // the LazyInitializationException a naive version of this hits.
        transactions.executeWithoutResult(status -> {
            bookingService.transition(booking.getId(), BookingStatus.AWAITING_CONFIRMATION, buyer, "e2e pay");
            bookingService.transition(booking.getId(), BookingStatus.CONFIRMED, buyer, "e2e settle");
            ticketService.issueForBooking(bookingRepository.findById(booking.getId()).orElseThrow());
        });
        return booking.getId();
    }

    private long insertId(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    // ==================================================================
    // 2. The customer can see and render their QR
    // ==================================================================

    @Test
    @Order(2)
    void theOwnerReadsTheirTicketsAndGetsARealSignedPayload() throws Exception {
        String body = mvc().perform(get("/api/v1/bookings/{id}/tickets", soloBookingId)
                        .header("X-User-Id", buyerIds.get(soloBookingId)))
                .andReturn().getResponse().getContentAsString();

        JsonNode tickets = JSON.readTree(body);
        assertThat(tickets).hasSize(1);

        soloPayload = tickets.get(0).get("qr_payload").asText();
        assertThat(soloPayload)
                .as("EBT1.<id>.<token>.<hmac>, over the wire, through Jackson")
                .startsWith("EBT1.")
                .matches("EBT1\\.\\d+\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{22}");

        JsonNode partyBody = JSON.readTree(
                mvc().perform(get("/api/v1/bookings/{id}/tickets", partyBookingId)
                                .header("X-User-Id", buyerIds.get(partyBookingId)))
                        .andReturn().getResponse().getContentAsString());
        partyPayloads = partyBody.findValuesAsText("qr_payload");
        assertThat(partyPayloads).hasSize(3).doesNotHaveDuplicates();
    }

    @Test
    @Order(3)
    void theQrEndpointReturnsScannableSvg() throws Exception {
        Long ticketId = ticketRepository.findByBookingId(soloBookingId).getFirst().getId();

        var response = mvc().perform(get("/api/v1/tickets/{id}/qr.svg", ticketId)
                        .header("X-User-Id", buyerIds.get(soloBookingId))
                        .param("size", "320"))
                .andReturn().getResponse();

        String svg = response.getContentAsString();
        assertThat(response.getContentType()).startsWith("image/svg+xml");
        assertThat(svg).startsWith("<svg").endsWith("</svg>");
        assertThat(svg).contains("width=\"320\"");
        // The quiet zone and the white ground are not decoration: a transparent
        // QR on a dark page inverts, and an inverted code does not scan.
        assertThat(svg).contains("fill=\"#ffffff\"");
        assertThat(response.getHeader("Cache-Control"))
                .as("a QR is a bearer credential")
                .contains("no-store");
    }

    // ==================================================================
    // 3. Authorization at the door
    // ==================================================================

    @Test
    @Order(4)
    void aCustomerCannotScanEvenTheirOwnTicket() throws Exception {
        mvc().perform(scan(soloPayload, eventId, String.valueOf(buyerIds.get(soloBookingId))))
                .andExpect(status().isForbidden());

        assertThat(ticketRepository.findByBookingId(soloBookingId).getFirst().isCheckedIn())
                .as("a refused scan must consume nothing")
                .isFalse();
    }

    @Test
    @Order(5)
    void aScanThatNamesNoEventIsRejected() throws Exception {
        mvc().perform(post("/api/v1/tickets/scan")
                        .header("X-User-Id", operator)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"payload\":\"" + soloPayload + "\"}"))
                .andExpect(status().isBadRequest());
    }

    // ==================================================================
    // 4. Individual scan
    // ==================================================================

    @Test
    @Order(6)
    void theOrganizerAdmitsTheTicketAndItCannotBeUsedTwice() throws Exception {
        JsonNode first = JSON.readTree(mvc().perform(scan(soloPayload, eventId, operator))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(first.get("admitted").asBoolean()).isTrue();
        assertThat(first.get("outcome").asText()).isEqualTo("VALID");
        assertThat(first.get("ticket").get("buyer_name").asText()).isNotBlank();
        assertThat(first.toString())
                .as("the gate must never be handed back a working payload")
                .doesNotContain(soloPayload);

        JsonNode second = JSON.readTree(mvc().perform(scan(soloPayload, eventId, operator))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(second.get("admitted").asBoolean()).isFalse();
        assertThat(second.get("outcome").asText()).isEqualTo("ALREADY_CHECKED_IN");
        assertThat(second.get("previous_check_in_at").asText()).isNotBlank();
    }

    @Test
    @Order(7)
    void forgedAndNonsenseCodesAnswer200WithARefusal() throws Exception {
        // A gate app needs one shape to render red from, so these are not 4xx.
        JsonNode barcode = JSON.readTree(mvc().perform(scan("4901234567894", eventId, operator))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(barcode.get("outcome").asText()).isEqualTo("MALFORMED");

        String[] parts = partyPayloads.getFirst().split("\\.");
        String forged = parts[0] + ".999999." + parts[2] + "." + parts[3];
        JsonNode tampered = JSON.readTree(mvc().perform(scan(forged, eventId, operator))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(tampered.get("outcome").asText()).isEqualTo("BAD_SIGNATURE");
    }

    // ==================================================================
    // 5. Group scan - the reason this feature exists
    // ==================================================================

    @Test
    @Order(8)
    void previewShowsTheWholePartyWithoutAdmittingAnyone() throws Exception {
        JsonNode preview = JSON.readTree(mvc().perform(group("preview", partyPayloads.getFirst(), eventId, operator, null))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(preview.get("admissible").asBoolean()).isTrue();
        assertThat(preview.get("total").asLong()).isEqualTo(3);
        assertThat(preview.get("remaining").asLong()).isEqualTo(3);
        assertThat(preview.get("tickets")).hasSize(3);
        assertThat(preview.get("booking").get("booking_ref").asText()).isNotBlank();
        // The field the whole group UI turns on has to survive serialisation.
        assertThat(preview.get("tickets").get(0).has("assigned")).isTrue();
        assertThat(preview.get("tickets").get(0).has("booking_item_id")).isTrue();

        assertThat(ticketRepository.findByBookingId(partyBookingId))
                .as("a preview consumes nothing")
                .noneMatch(Ticket::isCheckedIn);
    }

    @Test
    @Order(9)
    void twoOfThreeArriveNowAndTheThirdIsStillOwedEntry() throws Exception {
        // Named ids, not a count: on a mixed booking a count would burn whichever
        // tickets came first in seat order.
        String twoIds = ticketRepository.findByBookingId(partyBookingId).stream()
                .filter(t -> !t.isCheckedIn()).limit(2)
                .map(t -> String.valueOf(t.getId()))
                .collect(java.util.stream.Collectors.joining(","));

        JsonNode confirmed = JSON.readTree(
                mvc().perform(group("confirm", partyPayloads.getFirst(), eventId, operator, twoIds))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(confirmed.get("admitted").asBoolean()).isTrue();
        assertThat(confirmed.get("admitted_count").asInt()).isEqualTo(2);
        assertThat(confirmed.get("total").asLong()).isEqualTo(3);
        assertThat(confirmed.get("remaining").asLong())
                .as("the friend's ticket is untouched")
                .isEqualTo(1);

        assertThat(ticketRepository.findByBookingId(partyBookingId))
                .filteredOn(Ticket::isCheckedIn).hasSize(2);
    }

    @Test
    @Order(10)
    void namingAnAlreadyUsedTicketRefusesTheWholeCall() throws Exception {
        // A selection that went stale - another door admitted them while this
        // screen was open. Admitting the rest would send the steward away
        // believing three people went in.
        String usedAndFree = ticketRepository.findByBookingId(partyBookingId).stream()
                .map(t -> String.valueOf(t.getId()))
                .collect(java.util.stream.Collectors.joining(","));

        JsonNode refused = JSON.readTree(
                mvc().perform(group("confirm", partyPayloads.getFirst(), eventId, operator, usedAndFree))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(refused.get("admitted").asBoolean()).isFalse();
        assertThat(refused.get("outcome").asText()).isEqualTo("TICKET_NOT_IN_PARTY");

        assertThat(ticketRepository.findByBookingId(partyBookingId))
                .as("nothing was consumed by a refusal")
                .filteredOn(Ticket::isCheckedIn).hasSize(2);
    }

    @Test
    @Order(11)
    void theLatecomerGetsInOnTheCodeHisFriendsAlreadyUsed() throws Exception {
        // The party shared one phone. That code is spent, so the single-scan
        // endpoint refuses it - and says someone is still owed entry.
        JsonNode refused = JSON.readTree(
                mvc().perform(scan(partyPayloads.getFirst(), eventId, operator))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(refused.get("outcome").asText()).isEqualTo("ALREADY_CHECKED_IN");
        assertThat(refused.get("booking").get("remaining").asLong()).isEqualTo(1);

        // The group call admits him: the scanned code is only the key that finds
        // the booking; what gets spent is whatever is named and still free.
        String lastFree = ticketRepository.findByBookingId(partyBookingId).stream()
                .filter(t -> !t.isCheckedIn()).map(t -> String.valueOf(t.getId()))
                .collect(java.util.stream.Collectors.joining(","));

        JsonNode late = JSON.readTree(
                mvc().perform(group("confirm", partyPayloads.getFirst(), eventId, operator, lastFree))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(late.get("admitted_count").asInt()).isEqualTo(1);
        assertThat(late.get("remaining").asLong()).isZero();
        assertThat(ticketRepository.findByBookingId(partyBookingId)).allMatch(Ticket::isCheckedIn);
    }

    @Test
    @Order(12)
    void onceThePartyIsInThatSharedCodeAdmitsNobodyElse() throws Exception {
        // Every ticket is spent, so any id named is a used one.
        String anyId = String.valueOf(
                ticketRepository.findByBookingId(partyBookingId).getFirst().getId());

        JsonNode fourth = JSON.readTree(
                mvc().perform(group("confirm", partyPayloads.getFirst(), eventId, operator, anyId))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(fourth.get("admitted").asBoolean()).isFalse();
        assertThat(fourth.get("outcome").asText()).isEqualTo("TICKET_NOT_IN_PARTY");
        assertThat(ticketRepository.findByBookingId(partyBookingId))
                .filteredOn(Ticket::isCheckedIn).hasSize(3);
    }

    // ==================================================================
    // 6. Undo, stats, and the audit trail
    // ==================================================================

    @Test
    @Order(13)
    void aMistakenCheckInCanBeReversedAndTheTicketWorksAgain() throws Exception {
        Long ticketId = ticketRepository.findByBookingId(soloBookingId).getFirst().getId();

        mvc().perform(post("/api/v1/tickets/{id}/check-in/undo", ticketId)
                        .header("X-User-Id", operator)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"event_id\":" + eventId + ",\"reason\":\"Scanned the wrong person\"}"))
                .andExpect(status().isOk());

        assertThat(ticketRepository.findById(ticketId).orElseThrow().isCheckedIn()).isFalse();

        JsonNode rescan = JSON.readTree(mvc().perform(scan(soloPayload, eventId, operator))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(rescan.get("admitted").asBoolean())
                .as("a reversed ticket is spendable again")
                .isTrue();
    }

    @Test
    @Order(14)
    void statsAndTheAuditTrailReflectEverythingThatHappened() throws Exception {
        JsonNode stats = JSON.readTree(
                mvc().perform(get("/api/v1/events/{id}/check-in-stats", eventId)
                                .header("X-User-Id", operator))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(stats.get("tickets_issued").asLong()).isGreaterThanOrEqualTo(4);
        assertThat(stats.get("checked_in").asLong()).isGreaterThanOrEqualTo(4);
        assertThat(stats.get("refused_scans").asLong())
                .as("MALFORMED, BAD_SIGNATURE and the ALREADY_CHECKED_INs")
                .isGreaterThanOrEqualTo(4);

        mvc().perform(get("/api/v1/events/{id}/check-ins", eventId).header("X-User-Id", operator))
                .andExpect(status().isOk());

        // The fraud signal: a refused code leaves a row even though it touched
        // no ticket, and the row holds a digest rather than a working payload.
        var refusals = scanLogRepository.findByEventIdAndOutcomeNotOrderByAtDesc(
                eventId, "VALID", org.springframework.data.domain.PageRequest.of(0, 50));
        assertThat(refusals.getTotalElements()).isPositive();

        // A fingerprint is null only where there was no scanned code to digest -
        // an UNDO comes off a supervisor's screen, not a camera. Wherever one
        // exists it must be a digest, never the payload: this table is read by
        // more people than the ticket table is, and a payload opens a gate.
        assertThat(refusals.getContent())
                .filteredOn(row -> row.getPayloadFingerprint() != null)
                .isNotEmpty()
                .allSatisfy(row -> assertThat(row.getPayloadFingerprint())
                        .as("a digest, never the code")
                        .doesNotContain("EBT1.")
                        .hasSize(43));

        assertThat(refusals.getContent())
                .filteredOn(row -> row.getAction() == com.eventbooking.Enumeration.GateAction.UNDO)
                .allSatisfy(row -> {
                    assertThat(row.getPayloadFingerprint()).isNull();
                    assertThat(row.getNote()).as("an undo must say why").isNotBlank();
                });
    }

    // ==================================================================

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            scan(String payload, Long event, String userId) {
        return post("/api/v1/tickets/scan")
                .header("X-User-Id", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"payload\":\"" + payload + "\",\"event_id\":" + event + "}");
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            group(String leg, String payload, Long event, String userId, String ticketIds) {
        String body = "{\"payload\":\"" + payload + "\",\"event_id\":" + event
                + (ticketIds == null ? "" : ",\"ticket_ids\":[" + ticketIds + "]") + "}";
        return post("/api/v1/tickets/scan/group/" + leg)
                .header("X-User-Id", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private static org.springframework.test.web.servlet.ResultMatcher statusIs(int code) {
        return org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is(code);
    }

    private static org.springframework.test.web.servlet.result.StatusResultMatchers status() {
        return org.springframework.test.web.servlet.result.MockMvcResultMatchers.status();
    }
}
