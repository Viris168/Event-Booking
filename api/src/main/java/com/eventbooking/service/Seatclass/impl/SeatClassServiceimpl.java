package com.eventbooking.service.Seatclass.impl;

import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.SeatClassNotFoundException;
import com.eventbooking.dto.seatclass.CreateSeatClassRequest;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.dto.seatclass.UpdateSeatClassRequest;
import com.eventbooking.mapper.SeatClass.SeatClassMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.SeatClass;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Seatclass.SeatClassService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SeatClassServiceimpl implements SeatClassService {

    private final SeatClassRepository seatClassRepository;
    private final EventRepository eventRepository;
    private final OrganizerResolver organizerResolver;

    public SeatClassServiceimpl(SeatClassRepository seatClassRepository,
                                EventRepository eventRepository,
                                OrganizerResolver organizerResolver) {
        this.seatClassRepository = seatClassRepository;
        this.eventRepository = eventRepository;
        this.organizerResolver = organizerResolver;
    }

    @Override
    @Transactional
    public SeatClassResponse createSeatClass(Long organizerId, Long eventId, CreateSeatClassRequest request) {
        Event event = eventRepository.findById(eventId).orElseThrow(()-> new EventNotFoundException(eventId));
        organizerResolver.requireOwner(organizerId, event.getOrganizerId(), "event", eventId);
        SeatClass seatClass = SeatClassMapper.toSeatClass(request,event);
        seatClassRepository.save(seatClass);
        return SeatClassMapper.toSeatClassResponse(seatClass);
    }

    @Override
    @Transactional(readOnly = true)
    public SeatClassResponse getSeatClass(Long seatClassId) {
        SeatClass seatClass = seatClassRepository.findById(seatClassId).orElseThrow(()-> new SeatClassNotFoundException(seatClassId));
        return SeatClassMapper.toSeatClassResponse(seatClass);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SeatClassResponse> findByEvent(Long eventId) {
        List<SeatClass> seatClasses = seatClassRepository.findAllByEventId(eventId);
        return seatClasses.stream()
                .map(SeatClassMapper::toSeatClassResponse)
                .toList();
    }

    @Override
    @Transactional
    public SeatClassResponse updateSeatClass(Long organizerId, Long seatClassId, UpdateSeatClassRequest request) {
        SeatClass seatClass = seatClassRepository.findById(seatClassId).orElseThrow(()-> new SeatClassNotFoundException(seatClassId));
        // A tier inherits its event's organiser; there is no owner column here.
        organizerResolver.requireOwner(
                organizerId, seatClass.getEvent().getOrganizerId(), "seat class", seatClassId);
        if (request.nameEn() != null) seatClass.setNameEn(request.nameEn());
        if (request.nameKm() != null) seatClass.setNameKm(request.nameKm());
        if (request.priceUsdCents() != null) seatClass.setPriceUsdCents(request.priceUsdCents());
        SeatClass save =  seatClassRepository.save(seatClass);
        return SeatClassMapper.toSeatClassResponse(save);
    }
}
