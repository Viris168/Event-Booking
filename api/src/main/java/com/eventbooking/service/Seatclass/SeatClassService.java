package com.eventbooking.service.Seatclass;

import com.eventbooking.dto.seatclass.CreateSeatClassRequest;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.dto.seatclass.UpdateSeatClassRequest;

import java.util.List;

public interface SeatClassService {

    SeatClassResponse createSeatClass(
        Long eventId,
        CreateSeatClassRequest request
    );

    SeatClassResponse getSeatClass(Long seatClassId);

    List<SeatClassResponse> findByEvent(Long eventId);

    SeatClassResponse updateSeatClass(
        Long seatClassId,
        UpdateSeatClassRequest request
    );
}