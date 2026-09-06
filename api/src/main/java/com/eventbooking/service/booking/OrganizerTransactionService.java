package com.eventbooking.service.booking;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.dto.booking.MonthlyRevenueResponse;
import com.eventbooking.dto.booking.OrganizerTransactionResponse;
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
            Long organizerId, Long eventId, BookingStatus state, int page, int size);

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
