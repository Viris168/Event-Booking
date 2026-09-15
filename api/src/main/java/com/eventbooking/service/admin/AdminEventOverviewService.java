package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.dto.admin.AdminEventOverviewResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The moderation table, from the database.
 *
 * <p>Every figure on the screen used to be derived in the browser from
 * mock/store.js - which meant the sold/capacity bars and the revenue column
 * described a fixture file rather than the platform, and the take-down button
 * changed a field in a tab while the event carried on selling.
 */
@Service
public class AdminEventOverviewService {

    /** Revenue means money taken. Only CONFIRMED, matching the dashboard. */
    private static final Set<BookingStatus> REVENUE_STATES = EnumSet.of(BookingStatus.CONFIRMED);

    private final EventRepository eventRepository;
    private final EventZoneRepository zoneRepository;
    private final EventSeatRepository seatRepository;
    private final BookingRepository bookingRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final AppUserRepository userRepository;

    public AdminEventOverviewService(EventRepository eventRepository,
                                     EventZoneRepository zoneRepository,
                                     EventSeatRepository seatRepository,
                                     BookingRepository bookingRepository,
                                     OrganizerProfileRepository organizerProfileRepository,
                                     AppUserRepository userRepository) {
        this.eventRepository = eventRepository;
        this.zoneRepository = zoneRepository;
        this.seatRepository = seatRepository;
        this.bookingRepository = bookingRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.userRepository = userRepository;
    }

    /**
     * @param q            free text over event and venue titles. Blank means no filter.
     * @param status       exact status, or null for every status.
     * @param provinceCode venue province, or null for all.
     */
    @Transactional(readOnly = true)
    public List<AdminEventOverviewResponse> list(String q, EventStatus status, String provinceCode) {
        String needle = (q == null || q.isBlank()) ? null
                : "%" + q.trim().toLowerCase().replace("!", "!!")
                                 .replace("%", "!%")
                                 .replace("_", "!_") + "%";

        List<Event> events = eventRepository.searchForAdmin(needle, status, provinceCode);
        if (events.isEmpty()) return List.of();

        // Five aggregate queries for the whole table, not five per row.
        Map<Long, int[]> totals = totalsByEvent();
        Map<Long, Long> revenue = bookingRepository.sumRevenueByEvent(REVENUE_STATES).stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> ((Number) r[1]).longValue()));

        // Separate from revenue above, and not derivable from it: revenue counts
        // CONFIRMED only, while what blocks a delete is a booking row in ANY
        // state. An event with one expired booking has no revenue and is still
        // not deletable.
        Map<Long, Long> bookingCounts = bookingRepository.countByEvent().stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> ((Number) r[1]).longValue()));

        Map<Long, OrganizerProfile> profiles = organizerProfileRepository
                .findAllById(events.stream().map(Event::getOrganizerId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(OrganizerProfile::getId, p -> p));

        Map<Long, String> ownerNames = userRepository
                .findAllById(profiles.values().stream().map(OrganizerProfile::getUserId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(AppUser::getId, AppUser::getDisplayName, (a, b) -> a));

        return events.stream().map(e -> {
            int[] t = totals.getOrDefault(e.getId(), new int[3]);
            long bookings = bookingCounts.getOrDefault(e.getId(), 0L);
            OrganizerProfile profile = profiles.get(e.getOrganizerId());
            return new AdminEventOverviewResponse(
                    e.getId(),
                    e.getSlug(),
                    e.getTitleEn(),
                    e.getTitleKm(),
                    e.getStatus(),
                    e.getCategory(),
                    e.getStartsAt(),
                    e.getSalesOpenAt(),
                    e.getSalesCloseAt(),
                    e.getOrganizerId(),
                    profile == null ? null : profile.getOrgNameEn(),
                    profile == null ? null : profile.getOrgNameKm(),
                    profile == null ? null : ownerNames.get(profile.getUserId()),
                    e.getVenue().getId(),
                    e.getVenue().getNameEn(),
                    e.getVenue().getNameKm(),
                    e.getVenue().getProvinceCode(),
                    t[0], t[1], t[2],
                    revenue.getOrDefault(e.getId(), 0L),
                    bookings,
                    // Matches EventDeletionService exactly: sold inventory
                    // blocks a delete as surely as a booking row does, and the
                    // two disagree whenever an event carries sold_qty that no
                    // booking accounts for. A flag that said otherwise would
                    // offer a button the server then refuses.
                    bookings == 0 && t[1] == 0);
        }).toList();
    }

    /**
     * How many events are sitting in each status.
     *
     * <p>The review queue shows one status at a time but has to display all
     * four counts, so a reviewer can see three are waiting while they work
     * through the rejections. Every status is returned, zeros included - a tab
     * that vanishes when its queue empties moves the others under the cursor.
     */
    @Transactional(readOnly = true)
    public Map<EventStatus, Long> countsByStatus() {
        Map<EventStatus, Long> counts = new EnumMap<>(EventStatus.class);
        for (EventStatus status : EventStatus.values()) {
            counts.put(status, 0L);
        }
        for (Object[] row : eventRepository.countGroupedByStatus()) {
            counts.put((EventStatus) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    /**
     * Capacity, sold and held per event, counting both halves of the inventory
     * split.
     *
     * <p>Zones alone would under-report a SEATED or MIXED event by its entire
     * seat map - the same bug EventMapper's own comment describes, and the
     * reason the seat counts are folded in here rather than left out.
     *
     * @return eventId to {@code [capacity, sold, held]}.
     */
    private Map<Long, int[]> totalsByEvent() {
        Map<Long, int[]> totals = new HashMap<>();

        for (Object[] row : zoneRepository.totalsByEvent()) {
            Long eventId = (Long) row[0];
            int[] t = totals.computeIfAbsent(eventId, k -> new int[3]);
            t[0] += ((Number) row[1]).intValue();
            t[1] += ((Number) row[2]).intValue();
            t[2] += ((Number) row[3]).intValue();
        }

        for (Object[] row : seatRepository.statusCountsByEvent()) {
            Long eventId = (Long) row[0];
            SeatStatus seatStatus = (SeatStatus) row[1];
            int count = ((Number) row[2]).intValue();
            int[] t = totals.computeIfAbsent(eventId, k -> new int[3]);
            // Every seat that exists is capacity, BLOCKED included: it is a
            // place that is deliberately not for sale, which is what the bar
            // is meant to show rather than hide.
            t[0] += count;
            if (seatStatus == SeatStatus.SOLD) t[1] += count;
            else if (seatStatus == SeatStatus.HELD) t[2] += count;
        }

        return totals;
    }
}
