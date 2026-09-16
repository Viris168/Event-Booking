package com.eventbooking.service.booking;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.dto.booking.MonthlyRevenueResponse;
import com.eventbooking.dto.booking.OrganizerTransactionResponse;
import com.eventbooking.dto.booking.OrganizerTransactionSummaryResponse;
import org.springframework.data.domain.Page;

import java.util.List;

public interface OrganizerTransactionService {

    /**
     * Bookings across every event this organiser owns.
     *
     * <p>organizerId is resolved from the caller, never taken from the request:
     * the whole point of this screen is that it shows one organiser's customers
     * and nobody else's, which a client-supplied id would hand away.
     */
    Page<OrganizerTransactionResponse> listForOrganizer(
            Long organizerId, Long eventId, BookingStatus state, PaymentProvider provider,
            int page, int size);

    /**
     * Totals for the same filtered set {@link #listForOrganizer} pages through.
     *
     * <p>Its own call rather than a field on the page, because the heading
     * describes every matching transaction while the page holds twenty-five of
     * them - and the two numbers being the same shape is what let the screen
     * quietly print one where the other belonged.
     */
    OrganizerTransactionSummaryResponse summaryForOrganizer(
            Long organizerId, Long eventId, BookingStatus state, PaymentProvider provider);

    /**
     * Confirmed revenue per month for the last {@code months} months, oldest
     * first, with empty months included as zero.
     *
     * <p>Gaps are filled here rather than left to the client: a chart that
     * skipped quiet months would compress the time axis and imply business was
     * steady when it stopped.
     */
    List<MonthlyRevenueResponse> monthlyRevenue(Long organizerId, int months);


}
