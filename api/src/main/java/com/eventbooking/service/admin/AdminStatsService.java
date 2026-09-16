package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.PlatformStatsResponse;
import com.eventbooking.dto.admin.RecentBookingResponse;
import com.eventbooking.dto.admin.RecentEventResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Booking;
import com.eventbooking.model.Event;
import com.eventbooking.model.OrganizerProfile;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerApplicationRepository;
import com.eventbooking.repository.OrganizerProfileRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.repository.PayoutRequestRepository;
import com.eventbooking.repository.TicketRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The admin dashboard's numbers.
 *
 * <p>Every figure is a COUNT or a SUM issued against the database. The screen
 * used to compute all of them in the browser by walking the mock store's
 * arrays, which works only while the entire platform fits in a tab - and which
 * reported cheerful totals on an empty database.
 */
@Service
public class AdminStatsService {

    /** Money taken. Only CONFIRMED - see the field comment on grossUsdCents. */
    private static final Set<BookingStatus> GROSS_STATES = EnumSet.of(BookingStatus.CONFIRMED);

    /**
     * The window for the recent-takings figure.
     *
     * <p>30 days rather than a calendar month, so the number never collapses on
     * the 1st. A month-to-date figure is at its smallest the morning everybody
     * looks at it, and there is nothing to compare it against.
     */
    private static final Duration RECENT_TAKINGS = Duration.ofDays(30);

    /**
     * Payout requests that are still somebody's job. PAID is finished; the
     * other two are both money owed and neither can be left alone.
     */
    private static final Set<PayoutStatus> PAYOUTS_OPEN =
            EnumSet.of(PayoutStatus.REQUESTED, PayoutStatus.APPROVED);

    private final AppUserRepository userRepository;
    private final EventRepository eventRepository;
    private final BookingRepository bookingRepository;
    private final TicketRepository ticketRepository;
    private final PaymentTransactionRepository paymentRepository;
    private final OrganizerApplicationRepository applicationRepository;
    private final OrganizerProfileRepository organizerProfileRepository;
    private final PayoutRequestRepository payoutRepository;

    public AdminStatsService(AppUserRepository userRepository,
                             EventRepository eventRepository,
                             BookingRepository bookingRepository,
                             TicketRepository ticketRepository,
                             PaymentTransactionRepository paymentRepository,
                             OrganizerApplicationRepository applicationRepository,
                             OrganizerProfileRepository organizerProfileRepository,
                             PayoutRequestRepository payoutRepository) {
        this.userRepository = userRepository;
        this.eventRepository = eventRepository;
        this.bookingRepository = bookingRepository;
        this.ticketRepository = ticketRepository;
        this.paymentRepository = paymentRepository;
        this.applicationRepository = applicationRepository;
        this.organizerProfileRepository = organizerProfileRepository;
        this.payoutRepository = payoutRepository;
    }

    @Transactional(readOnly = true)
    public PlatformStatsResponse stats() {
        // One clock reading for the whole response. Three of these figures are
        // questions about "now", and taking the time three times lets them
        // disagree about which now they meant.
        Instant now = Instant.now();
        Instant stuckCutoff = now.minus(AdminPaymentService.STUCK_AFTER);

        return new PlatformStatsResponse(
                userRepository.count(),
                userRepository.countByRole(Role.CUSTOMER),
                userRepository.countByRole(Role.ORGANIZER),
                userRepository.countByIsDisabledTrue(),

                eventRepository.count(),
                eventRepository.countByStatus(EventStatus.PUBLISHED),
                eventRepository.countByStatus(EventStatus.DRAFT),
                eventRepository.countByStatus(EventStatus.PENDING_REVIEW),
                eventRepository.countByStatus(EventStatus.TAKEN_DOWN),

                bookingRepository.count(),
                bookingRepository.countByState(BookingStatus.CONFIRMED),
                bookingRepository.countByState(BookingStatus.AWAITING_CONFIRMATION),

                bookingRepository.sumTotalUsdCentsByStateIn(GROSS_STATES),
                bookingRepository.sumTotalUsdCentsByStateInSince(GROSS_STATES, now.minus(RECENT_TAKINGS)),

                ticketRepository.count(),
                ticketRepository.countByCheckedInAtIsNotNull(),

                paymentRepository.countByStatusInAndCreatedAtLessThanEqual(
                        PaymentStatus.openStates(), stuckCutoff),

                applicationRepository.countByStatus(OrganizerApplicationStatus.PENDING),

                eventRepository.countOnSale(now),

                payoutRepository.countByStatusIn(PAYOUTS_OPEN),
                payoutRepository.sumNetUsdCentsByStatusIn(PAYOUTS_OPEN));
    }

    /**
     * The latest bookings strip.
     *
     * <p>Buyer names are resolved in one lookup keyed by id rather than per
     * row. Booking holds a raw {@code userId} rather than a {@code @ManyToOne},
     * so there is no association to fetch-join and the alternative really is a
     * query per row.
     */
    @Transactional(readOnly = true)
    public List<RecentBookingResponse> recentBookings(int limit) {
        List<Booking> bookings = bookingRepository.findRecentWithEvent(PageRequest.of(0, limit));
        if (bookings.isEmpty()) return List.of();

        Map<Long, String> names = userRepository
                .findAllById(bookings.stream().map(Booking::getUserId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(AppUser::getId, AppUser::getDisplayName, (a, b) -> a));

        return bookings.stream().map(b -> new RecentBookingResponse(
                b.getId(),
                b.getBookingRef(),
                b.getState(),
                b.getCreatedAt(),
                b.getTotalUsdCents(),
                b.getBuyerName(),
                b.getBuyerPhoneE164(),
                b.getEvent() == null ? null : b.getEvent().getId(),
                b.getEvent() == null ? null : b.getEvent().getTitleEn(),
                b.getEvent() == null ? null : b.getEvent().getTitleKm(),
                b.getUserId(),
                names.get(b.getUserId())
        )).toList();
    }

    /**
     * The latest events strip.
     *
     * <p>Organiser names are resolved in one lookup keyed by id, exactly as the
     * bookings strip resolves buyers: {@code event.organizer_id} is a raw column
     * rather than a {@code @ManyToOne}, so there is no association to
     * fetch-join and the alternative really is a query per row.
     *
     * <p>Only the organisation name is carried, not the owner's - the
     * moderation table prints "org · owner" because it has a column to itself;
     * here the name sits under the title as a second line and one of the two is
     * enough to say whose listing it is.
     */
    @Transactional(readOnly = true)
    public List<RecentEventResponse> recentEvents(int limit) {
        List<Event> events = eventRepository.findRecentForAdmin(PageRequest.of(0, limit));
        if (events.isEmpty()) return List.of();

        Map<Long, OrganizerProfile> profiles = organizerProfileRepository
                .findAllById(events.stream().map(Event::getOrganizerId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(OrganizerProfile::getId, p -> p));

        return events.stream().map(e -> {
            OrganizerProfile profile = profiles.get(e.getOrganizerId());
            return new RecentEventResponse(
                    e.getId(),
                    e.getSlug(),
                    e.getTitleEn(),
                    e.getTitleKm(),
                    e.getStatus(),
                    e.getCreatedAt(),
                    e.getStartsAt(),
                    e.getSalesOpenAt(),
                    e.getSalesCloseAt(),
                    e.getOrganizerId(),
                    profile == null ? null : profile.getOrgNameEn(),
                    profile == null ? null : profile.getOrgNameKm(),
                    e.getVenue().getNameEn(),
                    e.getVenue().getNameKm(),
                    e.getVenue().getProvinceCode());
        }).toList();
    }
}
