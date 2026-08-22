package com.eventbooking.config;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.InventoryMode;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.model.*;
import com.eventbooking.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Component
public class DatabaseSeeder implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final VenueRepository venueRepository;
    private final VenueSeatRepository venueSeatRepository;
    private final EventRepository eventRepository;
    private final SeatClassRepository seatClassRepository;
    private final EventZoneRepository eventZoneRepository;
    private final EventSeatRepository eventSeatRepository;
    private final JdbcTemplate jdbcTemplate;

    public DatabaseSeeder(
            AppUserRepository userRepository,
            VenueRepository venueRepository,
            VenueSeatRepository venueSeatRepository,
            EventRepository eventRepository,
            SeatClassRepository seatClassRepository,
            EventZoneRepository eventZoneRepository,
            EventSeatRepository eventSeatRepository,
            JdbcTemplate jdbcTemplate) {
        this.userRepository = userRepository;
        this.venueRepository = venueRepository;
        this.venueSeatRepository = venueSeatRepository;
        this.eventRepository = eventRepository;
        this.seatClassRepository = seatClassRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.eventSeatRepository = eventSeatRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) throws Exception {
        if (venueRepository.count() > 0) {
            System.out.println("Database already seeded. Skipping...");
            return;
        }

        System.out.println("Seeding database...");

        // 1. Seed Provinces via JdbcTemplate (to bypass missing JPA entity)
        jdbcTemplate.execute("INSERT INTO province_ref (code, name_en, name_km) VALUES ('12', 'Phnom Penh', 'ភ្នំពេញ') ON CONFLICT DO NOTHING;");
        jdbcTemplate.execute("INSERT INTO province_ref (code, name_en, name_km) VALUES ('17', 'Siem Reap', 'សៀមរាប') ON CONFLICT DO NOTHING;");

        // 2. Demo identities are seeded by V6__seed_demo_users.sql (they mirror
        // the web prototype's mock store, whose ids arrive in the X-User-Id
        // header). Reuse the demo organizer instead of inventing one; only fall
        // back to a placeholder when the migration's users are somehow missing.
        AppUser organizerUser = userRepository.findFirstByRoleOrderByIdAsc(Role.ORGANIZER)
                .orElseGet(() -> userRepository.save(AppUser.builder()
                        .phoneE164("+85599990001")
                        .passwordHash("hashed-password")
                        .displayName("Dev Organizer")
                        .role(Role.ORGANIZER)
                        .isDisabled(false)
                        .build()));

        // Seed Organizer Profile via JdbcTemplate (idempotent across restarts)
        boolean demoOrganizer = "+85512987654".equals(organizerUser.getPhoneE164());
        Long organizerId = jdbcTemplate.queryForObject(
                "INSERT INTO organizer_profile (user_id, org_name_en, org_name_km, telegram_chat_id) " +
                "VALUES (?, ?, ?, ?) " +
                "ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id " +
                "RETURNING id",
                Long.class,
                organizerUser.getId(),
                demoOrganizer ? "Mekong Live Productions" : "Dev Promotions",
                demoOrganizer ? "ផលិតកម្មមេគង្គឡាយវ៍" : "ដេវ ប្រូម៉ូសិន",
                demoOrganizer ? "-1001234567" : null
        );

        // 3. Seed Venues
        String[] venueNames = {"Koh Pich Theatre", "Morodok Techo Stadium", "Aeon Mall Hall", "Olympic Stadium", "Chaktomuk Theatre", "Major Cineplex Aeon 2"};
        String[] venueNamesKm = {"រោងមហោស្រពកោះពេជ្រ", "ពហុកីឡដ្ឋានមរតកតេជោ", "សាលអុីអនម៉ល", "ពហុកីឡដ្ឋានជាតិអូឡាំពិក", "រោងមហោស្រពចតុមុខ", "រោងកុនមេជ័រអុីអន២"};
        List<Venue> venues = new ArrayList<>();
        List<List<VenueSeat>> allVenueSeats = new ArrayList<>();
        
        for (int i = 0; i < 6; i++) {
            Venue venue = Venue.builder()
                    .organizerId(organizerId)
                    .nameEn(venueNames[i])
                    .nameKm(venueNamesKm[i])
                    .provinceCode("12")
                    .khanDistrict("Chamkarmon")
                    .sangkatCommune("Tonle Bassac")
                    .streetAddress("Street " + (100 + i))
                    .lat(new BigDecimal("11.5540"))
                    .lng(new BigDecimal("104.9388"))
                    .isDisabled(false)
                    .build();
            venue = venueRepository.save(venue);
            venues.add(venue);

            // Generate Venue Seats (A simple 5x10 grid for each)
            List<VenueSeat> venueSeats = new ArrayList<>();
            String[] rows = {"A", "B", "C", "D", "E"};
            for (int rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                for (int seatNum = 1; seatNum <= 10; seatNum++) {
                    venueSeats.add(VenueSeat.builder()
                            .venue(venue)
                            .sectionLabel("Main Floor")
                            .rowLabel(rows[rowIdx])
                            .seatNumber(String.valueOf(seatNum))
                            .posX(new BigDecimal(seatNum * 30))
                            .posY(new BigDecimal(rowIdx * 30))
                            .build());
                }
            }
            venueSeats = venueSeatRepository.saveAll(venueSeats);
            allVenueSeats.add(venueSeats);
        }

        // 4. Seed Events
        String[] eventTitles = {"Dev Show 2026", "Cambodia Tech Summit", "K-Pop Live in PP", "National Comedy Night"};
        String[] eventTitlesKm = {"កម្មវិធីសាកល្បង ២០២៦", "កិច្ចប្រជុំកំពូលបច្ចេកវិទ្យាកម្ពុជា", "ការប្រគុំតន្ត្រី K-Pop", "រាត្រីកំប្លែងជាតិ"};
        Instant now = Instant.now();

        for (int i = 0; i < 4; i++) {
            int venueIdx = i % venues.size();
            Venue eventVenue = venues.get(venueIdx);
            List<VenueSeat> currentVenueSeats = allVenueSeats.get(venueIdx);
            
            Event event = Event.builder()
                    .organizerId(organizerId)
                    .venue(eventVenue)
                    .inventoryMode(InventoryMode.MIXED)
                    .slug("event-" + (i + 1) + "-2026")
                    .titleEn(eventTitles[i])
                    .titleKm(eventTitlesKm[i])
                    .descriptionEn("An amazing event in Cambodia.")
                    .descriptionKm("កម្មវិធីដ៏អស្ចារ្យនៅកម្ពុជា។")
                    .status(EventStatus.PUBLISHED)
                    .startsAt(now.plus(30 + i, ChronoUnit.DAYS))
                    .doorsOpenAt(now.plus(30 + i, ChronoUnit.DAYS).minus(1, ChronoUnit.HOURS))
                    .salesOpenAt(now.minus(1, ChronoUnit.DAYS))
                    .salesCloseAt(now.plus(29 + i, ChronoUnit.DAYS))
                    .build();
            event = eventRepository.save(event);

            // 5. Seed Seat Classes
            SeatClass vipClass = SeatClass.builder()
                    .event(event)
                    .nameEn("VIP")
                    .nameKm("វីអាយភី")
                    .priceUsdCents(5000) // $50.00
                    .build();
            
            SeatClass regularClass = SeatClass.builder()
                    .event(event)
                    .nameEn("Regular")
                    .nameKm("ធម្មតា")
                    .priceUsdCents(2500) // $25.00
                    .build();
            
            seatClassRepository.saveAll(List.of(vipClass, regularClass));

            // 6. Seed Event Zones (GA)
            EventZone standingZone = EventZone.builder()
                    .event(event)
                    .nameEn("Standing Area")
                    .nameKm("តំបន់ឈរ")
                    .priceUsdCents(1500) // $15.00
                    .capacity(500)
                    .heldQty(0)
                    .soldQty(0)
                    .build();
            eventZoneRepository.save(standingZone);

            // 7. Seed Event Seats
            List<EventSeat> eventSeats = new ArrayList<>();
            for (VenueSeat vs : currentVenueSeats) {
                SeatClass sClass = (vs.getRowLabel().equals("A") || vs.getRowLabel().equals("B")) ? vipClass : regularClass;
                eventSeats.add(EventSeat.builder()
                        .event(event)
                        .venueSeat(vs)
                        .seatClass(sClass)
                        .status(com.eventbooking.Enumeration.SeatStatus.AVAILABLE)
                        .build());
            }
            eventSeatRepository.saveAll(eventSeats);
        }

        System.out.println("Database successfully seeded with 6 Venues and 4 Events!");
    }
}
