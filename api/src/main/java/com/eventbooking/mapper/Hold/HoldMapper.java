package com.eventbooking.mapper.Hold;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.dto.hold.CreateHoldRequest;
import com.eventbooking.model.Event;
import com.eventbooking.model.Hold;

import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.SeatClassRepository;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;


@Component
public class HoldMapper {


    public static Hold toHold(CreateHoldRequest createHoldRequest, Event event, Long userId) {

        return Hold.builder()
                .event(event)
                .userId(userId)
                .status(HoldStatus.ACTIVE)
                .expiresAt(Instant.now().plus(10, ChronoUnit.MINUTES)) // Hold expires in 10 mins
                .build();
    }

}
