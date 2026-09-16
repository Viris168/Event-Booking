package com.eventbooking.service.booking.impl;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.dto.booking.MonthlyRevenueResponse;
import com.eventbooking.dto.booking.OrganizerTransactionResponse;
import com.eventbooking.dto.booking.OrganizerTransactionSummaryResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.repository.BookingRepository;
import com.eventbooking.repository.PaymentTransactionRepository;
import com.eventbooking.service.booking.OrganizerTransactionService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class OrganizerTransactionServiceimpl implements OrganizerTransactionService {

    /** Money that actually landed. The payout invoice counts the same states. */
    private static final Set<BookingStatus> EARNING = EnumSet.of(BookingStatus.CONFIRMED);

    private final BookingRepository bookingRepository;
    private final PaymentTransactionRepository paymentTransactionRepository;

    public OrganizerTransactionServiceimpl(BookingRepository bookingRepository,
                                           PaymentTransactionRepository paymentTransactionRepository) {
        this.bookingRepository = bookingRepository;
        this.paymentTransactionRepository = paymentTransactionRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<OrganizerTransactionResponse> listForOrganizer(
            Long organizerId, Long eventId, BookingStatus state, PaymentProvider provider,
            int page, int size) {

        Page<Booking> bookings = bookingRepository.findForOrganizer(
                organizerId, eventId, state, provider, PageRequest.of(page, size));

        Map<Long, String> providers = providersFor(bookings.getContent());

        return bookings.map(b -> new OrganizerTransactionResponse(
                b.getId(),
                b.getBookingRef(),
                b.getEvent().getId(),
                b.getEvent().getTitleEn(),
                b.getEvent().getTitleKm(),
                b.getBuyerName(),
                b.getBuyerPhoneE164(),
                providers.get(b.getId()),
                b.getState(),
                b.getTotalUsdCents(),
                b.getCreatedAt()));
    }

    

    

    @Override
    @Transactional(readOnly = true)
    public OrganizerTransactionSummaryResponse summaryForOrganizer(
            Long organizerId, Long eventId, BookingStatus state, PaymentProvider provider) {
        var totals = bookingRepository.totalsForOrganizer(organizerId, eventId, state, provider, EARNING);
        return new OrganizerTransactionSummaryResponse(
                totals.getTxCount(), totals.getSettledUsdCents());
    }

    @Override
    @Transactional(readOnly = true)
    public List<MonthlyRevenueResponse> monthlyRevenue(Long organizerId, int months) {
        int span = Math.max(1, Math.min(months, 36));

        // Truncated to the first of the month so a request on the 6th still
        // includes everything from the 1st of the earliest month in the window.
        YearMonth earliest = YearMonth.now(ZoneOffset.UTC).minusMonths(span - 1L);
        Instant since = earliest.atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        Map<YearMonth, Object[]> rows = new HashMap<>();
        for (Object[] row : bookingRepository.findMonthlyRevenue(organizerId, since)) {
            rows.put(YearMonth.of(((Number) row[0]).intValue(), ((Number) row[1]).intValue()), row);
        }

        // Walk the window rather than the result set: SQL returns only months
        // that had a booking, and a chart drawn from those alone would put
        // March next to August and call it a trend.
        List<MonthlyRevenueResponse> out = new ArrayList<>(span);
        for (int i = 0; i < span; i++) {
            YearMonth ym = earliest.plusMonths(i);
            Object[] row = rows.get(ym);
            out.add(new MonthlyRevenueResponse(
                    ym.getYear(),
                    ym.getMonthValue(),
                    row == null ? 0L : ((Number) row[2]).longValue(),
                    row == null ? 0L : ((Number) row[3]).longValue()));
        }
        return out;
    }

    /**
     * Most recent provider per booking, in one query for the whole page.
     *
     * <p>The rows arrive newest first, so the first entry seen for a booking is
     * its latest attempt and later ones are earlier retries - putIfAbsent keeps
     * the right one without sorting again.
     */
    private Map<Long, String> providersFor(List<Booking> bookings) {
        if (bookings.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = bookings.stream().map(Booking::getId).toList();
        Map<Long, String> latest = new HashMap<>();
        for (Object[] row : paymentTransactionRepository.findProviderByBookingIds(ids)) {
            latest.putIfAbsent((Long) row[0], String.valueOf(row[1]));
        }
        return latest;
    }

    
}
