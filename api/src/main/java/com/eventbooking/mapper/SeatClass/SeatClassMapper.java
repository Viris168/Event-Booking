package com.eventbooking.mapper.SeatClass;

import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.dto.seatclass.CreateSeatClassRequest;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.model.Event;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.VenueSeat;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;


@Component

public class SeatClassMapper {

    public static SeatClass toSeatClass(CreateSeatClassRequest createSeatClassRequest, Event event) {
        return SeatClass.builder()
                .nameEn(createSeatClassRequest.nameEn())
                .nameKm(createSeatClassRequest.nameKm())
                .priceUsdCents(createSeatClassRequest.priceUsdCents())
                .event(event)
                .build();
    }

    /**
     * The one section this tier's seats sit in, or null if that is not a
     * single answer. Reads the seats already walked for the counts below, so
     * it costs nothing extra.
     */
    private static String sectionLabelOf(SeatClass seatClass) {
        Set<String> sections = seatClass.getEventSeats().stream()
                .map(seat -> seat.getVenueSeat())
                .filter(Objects::nonNull)
                .map(VenueSeat::getSectionLabel)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        return sections.size() == 1 ? sections.iterator().next() : null;
    }

    public static SeatClassResponse toSeatClassResponse(SeatClass seatClass) {
        return new SeatClassResponse(
                seatClass.getId(),
                seatClass.getEvent().getId(),
                seatClass.getNameEn(),
                seatClass.getNameKm(),
                seatClass.getPriceUsdCents(),
                sectionLabelOf(seatClass),
                seatClass.getEventSeats().size(),
                seatClass.getEventSeats().stream()
                        .filter(seat -> seat.getStatus() == SeatStatus.SOLD)
                        .count(),
                seatClass.getEventSeats().stream()
                        .filter(seat -> seat.getStatus() == SeatStatus.HELD)
                        .count()
        );
    }

}
