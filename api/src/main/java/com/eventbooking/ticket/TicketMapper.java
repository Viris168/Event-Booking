package com.eventbooking.ticket;

import com.eventbooking.dto.ticket.GroupConfirmResponse;
import com.eventbooking.dto.ticket.GroupPreviewResponse;
import com.eventbooking.dto.ticket.ScanResponse;
import com.eventbooking.dto.ticket.ScannedParty;
import com.eventbooking.dto.ticket.TicketResponse;
import com.eventbooking.model.Booking;
import com.eventbooking.model.BookingItem;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.Ticket;
import com.eventbooking.model.VenueSeat;
import org.springframework.stereotype.Component;

import java.util.List;

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

    // ------------------------------------------------------------------
    // Group scan
    // ------------------------------------------------------------------

    /**
     * The booking behind a scanned code, shared by preview and confirm.
     *
     * <p>Reads {@code booking.getEvent()}, so - like everything else here - it
     * has to run inside the transaction that loaded the ticket.
     */
    public ScannedParty toParty(Booking booking) {
        return new ScannedParty(
                booking.getId(),
                booking.getBookingRef(),
                booking.getBuyerName(),
                booking.getEvent().getTitleEn());
    }

    /**
     * One row of the preview list, state included.
     *
     * <p>Carries {@code checkedIn} where {@link #toAdmittedTicket} does not:
     * the preview screen exists precisely to show a steward that two of four
     * are already inside, and that fact disappears if used rows are filtered
     * out or rendered identically to free ones.
     */
    public GroupPreviewResponse.PreviewTicket toPreviewTicket(Ticket ticket) {
        BookingItem item = ticket.getBookingItem();
        return new GroupPreviewResponse.PreviewTicket(
                ticket.getId(),
                item.getId(),
                tierName(item),
                seatLocation(item),
                ticket.getUnitSeq(),
                item.getEventSeat() != null,
                ticket.isCheckedIn(),
                ticket.getCheckedInAt());
    }

    /**
     * One admission a confirm just granted.
     *
     * <p>No check-in state: every ticket in that list was free a moment ago and
     * is not now, so a flag saying so would be a constant.
     */
    public GroupConfirmResponse.AdmittedTicket toAdmittedTicket(Ticket ticket) {
        BookingItem item = ticket.getBookingItem();
        return new GroupConfirmResponse.AdmittedTicket(
                ticket.getId(),
                tierName(item),
                seatLocation(item),
                ticket.getUnitSeq());
    }

    /** Convenience for the two group calls, which always map a whole list. */
    public List<GroupPreviewResponse.PreviewTicket> toPreviewTickets(List<Ticket> tickets) {
        return tickets.stream().map(this::toPreviewTicket).toList();
    }

    public List<GroupConfirmResponse.AdmittedTicket> toAdmittedTickets(List<Ticket> tickets) {
        return tickets.stream().map(this::toAdmittedTicket).toList();
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
