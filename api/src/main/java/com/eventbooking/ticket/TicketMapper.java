package com.eventbooking.ticket;

import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.dto.ticket.TicketResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.Ticket;
import com.eventbooking.model.VenueSeat;
import org.springframework.stereotype.Component;

/**
 * Entity -> DTO for tickets. Same rule as the other mappers: call it inside the
 * transaction that loaded the ticket. It walks further than most - ticket to
 * booking item to seat to venue seat - because a gate needs the physical seat,
 * not the pricing tier it was sold under.
 */
@Component
public class TicketMapper {

    private final TicketTokenCodec codec;

    public TicketMapper(TicketTokenCodec codec) {
        this.codec = codec;
    }

    public TicketResponse toResponse(Ticket ticket) {
        BookingItem item = ticket.getBookingItem();
        Booking booking = item.getBooking();

        return new TicketResponse(
                ticket.getId(),
                booking.getId(),
                booking.getBookingRef(),
                booking.getEvent().getId(),
                booking.getEvent().getTitleEn(),
                booking.getEvent().getTitleKm(),
                booking.getEvent().getStartsAt(),
                tierName(item),
                seatLocation(item),
                ticket.getUnitSeq(),
                item.getQty(),
                codec.encode(ticket.getId(), ticket.getQrToken()),
                ticket.getIssuedAt(),
                ticket.isCheckedIn(),
                ticket.getCheckedInAt()
        );
    }

    /** The gate's view - everything above except the payload, which is a secret. */
    public ScanResponse.ScannedTicket toScannedTicket(Ticket ticket) {
        BookingItem item = ticket.getBookingItem();
        Booking booking = item.getBooking();

        return new ScanResponse.ScannedTicket(
                ticket.getId(),
                booking.getBookingRef(),
                booking.getBuyerName(),
                booking.getEvent().getTitleEn(),
                tierName(item),
                seatLocation(item),
                ticket.getUnitSeq(),
                item.getQty()
        );
    }

    private String tierName(BookingItem item) {
        return item.getEventSeat() != null
                ? item.getEventSeat().getSeatClass().getNameEn()
                : item.getEventZone().getNameEn();
    }

    /**
     * "Section A · Row 3 · Seat 12", or null for a zone ticket - standing
     * admission has no seat, and inventing a label for one would be a lie a
     * steward might act on.
     */
    private String seatLocation(BookingItem item) {
        EventSeat seat = item.getEventSeat();
        if (seat == null) {
            return null;
        }
        VenueSeat physical = seat.getVenueSeat();
        return "Section " + physical.getSectionLabel()
                + " · Row " + physical.getRowLabel()
                + " · Seat " + physical.getSeatNumber();
    }
}
