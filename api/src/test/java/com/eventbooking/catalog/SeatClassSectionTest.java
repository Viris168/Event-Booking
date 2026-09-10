package com.eventbooking.catalog;

import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.mapper.SeatClass.SeatClassMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.VenueSeat;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Which venue section a pricing tier belongs to.
 *
 * <p>A {@code seat_class} has no section column: the link runs through
 * {@code event_seat} to {@code venue_seat.section_label}. The organiser's event
 * form binds one tier per section, so it needs that answer - and while
 * {@code SeatClassResponse} did not carry it, the form read an absent field,
 * matched no section, and opened every existing seated event with its pricing
 * blank and its save button refusing.
 */
class SeatClassSectionTest {

    private static VenueSeat seatIn(String section) {
        return VenueSeat.builder().sectionLabel(section).build();
    }

    private static SeatClass tierWith(VenueSeat... venueSeats) {
        SeatClass tier = SeatClass.builder()
                .id(1L)
                .event(Event.builder().id(7L).build())
                .nameEn("VIP")
                .nameKm("វីអាយភី")
                .priceUsdCents(2500)
                .build();
        tier.setEventSeats(List.of(venueSeats).stream()
                .map(vs -> EventSeat.builder()
                        .venueSeat(vs)
                        .status(SeatStatus.AVAILABLE)
                        .build())
                .toList());
        return tier;
    }

    @Test
    void reportsTheSectionItsSeatsSitIn() {
        SeatClassResponse res = SeatClassMapper.toSeatClassResponse(
                tierWith(seatIn("Balcony"), seatIn("Balcony")));

        assertThat(res.sectionLabel()).isEqualTo("Balcony");
        assertThat(res.seatCount()).isEqualTo(2);
    }

    /**
     * Null, not a guess. The form would otherwise bind this tier to whichever
     * section happened to come first and show its price against seats it does
     * not price.
     */
    @Test
    void reportsNoSectionWhenSeatsSpanTwo() {
        SeatClassResponse res = SeatClassMapper.toSeatClassResponse(
                tierWith(seatIn("Balcony"), seatIn("Stalls")));

        assertThat(res.sectionLabel()).isNull();
    }

    /**
     * A tier that has been priced but not yet filled. Legal, and common - it is
     * the state between creating a class and assigning seats to it.
     */
    @Test
    void reportsNoSectionWhenNoSeatsAreAssigned() {
        SeatClassResponse res = SeatClassMapper.toSeatClassResponse(tierWith());

        assertThat(res.sectionLabel()).isNull();
        assertThat(res.seatCount()).isZero();
    }
}
