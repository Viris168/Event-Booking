package com.eventbooking.service.admin;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.OrganizerApplicationStatus;
import com.eventbooking.Enumeration.PaymentStatus;
import com.eventbooking.Enumeration.Role;
import com.eventbooking.dto.admin.PlatformStatsResponse;
import com.eventbooking.dto.admin.RecentBookingResponse;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Booking;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.OrganizerApplicationRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.repository.TicketRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    private final AppUserRepository userRepository;
    private final EventRepository eventRepository;
    private final BookingRepository bookingRepository;
    private final TicketRepository ticketRepository;
    private final PaymentTransactionRepository paymentRepository;
    private final OrganizerApplicationRepository applicationRepository;

    public AdminStatsService(AppUserRepository userRepository,
                             EventRepository eventRepository,
                             BookingRepository bookingRepository,
                             TicketRepository ticketRepository,
                             PaymentTransactionRepository paymentRepository,
                             OrganizerApplicationRepository applicationRepository) {
        this.userRepository = userRepository;
        this.eventRepository = eventRepository;
        this.bookingRepository = bookingRepository;
        this.ticketRepository = ticketRepository;
        this.paymentRepository = paymentRepository;
        this.applicationRepository = applicationRepository;
    }

    @Transactional(readOnly = true)
    public PlatformStatsResponse stats() {
        Instant stuckCutoff = Instant.now().minus(AdminPaymentService.STUCK_AFTER);

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
                bookingRepository.countByState(BookingStatus.REFUND_REQUESTED),

                bookingRepository.sumTotalUsdCentsByStateIn(GROSS_STATES),

                ticketRepository.count(),
                ticketRepository.countByCheckedInAtIsNotNull(),

                paymentRepository.countByStatusInAndCreatedAtLessThanEqual(
                        PaymentStatus.openStates(), stuckCutoff),

                applicationRepository.countByStatus(OrganizerApplicationStatus.PENDING));
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
}
