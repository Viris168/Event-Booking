package com.eventbooking.mapper.SeatClass;

import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.dto.seatclass.CreateSeatClassRequest;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.model.Event;
import com.eventbooking.model.SeatClass;
import com.eventbooking.repository.EventRepository;
import org.springframework.stereotype.Component;

import java.util.List;

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

    public static SeatClassResponse toSeatClassResponse(SeatClass seatClass) {
        return new SeatClassResponse(
                seatClass.getId(),
                seatClass.getEvent().getId(),
                seatClass.getNameEn(),
                seatClass.getNameKm(),
                seatClass.getPriceUsdCents(),
                seatClass.getEventSeats().size(),
                seatClass.getEventSeats().stream()
                        .filter(seat -> seat.getStatus() == SeatStatus.SOLD)
                        .count()
        );
    }

}
