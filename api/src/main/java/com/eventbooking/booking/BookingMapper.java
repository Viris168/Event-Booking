package com.eventbooking.booking;

import com.eventbooking.dto.booking.BookingItemResponse;
import com.eventbooking.dto.booking.BookingResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Entity -> DTO for the booking lane. Must be called inside the transaction
 * that loaded the booking: open-in-view is off, so the lazy associations it
 * walks (items, seat class, zone) cannot be initialised afterwards.
 */
@Component
public class BookingMapper {

    public BookingResponse toResponse(Booking booking) {
        List<BookingItemResponse> items = booking.getItems().stream()
                .map(this::toItemResponse)
                .toList();

        return new BookingResponse(
                booking.getId(),
                booking.getBookingRef(),
                booking.getEvent().getId(),
                booking.getUserId(),
                booking.getHold().getId(),
                booking.getState(),
                booking.getBuyerName(),
                booking.getBuyerPhoneE164(),
                booking.getBuyerEmail(),
                booking.getSubtotalUsdCents(),
                booking.getTotalUsdCents(),
                booking.getFxRateKhrPerUsd(),
                booking.getTotalKhr(),
                booking.getCreatedAt(),
                booking.getStateChangedAt(),
                items
        );
    }

    private BookingItemResponse toItemResponse(BookingItem item) {
        boolean isSeat = item.getEventSeat() != null;

        // The label is what the customer reads on the ticket. Seat lines carry
        // their pricing tier's name rather than a row/seat number, because
        // venue_seat lives one hop further out and checkout has no reason to
        // load the physical seat map.
        String label = isSeat
                ? item.getEventSeat().getSeatClass().getNameEn()
                : item.getEventZone().getNameEn();

        return new BookingItemResponse(
                item.getId(),
                isSeat ? item.getEventSeat().getId() : null,
                isSeat ? null : item.getEventZone().getId(),
                label,
                item.getQty(),
                item.getUnitPriceUsdCents(),
                item.lineTotalUsdCents()
        );
    }
}
