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
import com.eventbooking.service.Seatclass.SeatClassService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SeatClassServiceimpl implements SeatClassService {

    private final SeatClassRepository seatClassRepository;
    private final EventRepository eventRepository;

    public SeatClassServiceimpl(SeatClassRepository seatClassRepository, EventRepository eventRepository) {
        this.seatClassRepository = seatClassRepository;
        this.eventRepository = eventRepository;
    }


    @Override
    public SeatClassResponse createSeatClass(Long eventId, CreateSeatClassRequest request) {
        Event event = eventRepository.findById(eventId).orElseThrow(()-> new EventNotFoundException(eventId));
        SeatClass seatClass = SeatClassMapper.toSeatClass(request,event);
        seatClassRepository.save(seatClass);
        return SeatClassMapper.toSeatClassResponse(seatClass);
    }

    @Override
    public SeatClassResponse getSeatClass(Long seatClassId) {
        SeatClass seatClass = seatClassRepository.findById(seatClassId).orElseThrow(()-> new SeatClassNotFoundException(seatClassId));
        return SeatClassMapper.toSeatClassResponse(seatClass);
    }

    @Override
    public List<SeatClassResponse> findByEvent(Long eventId) {
        List<SeatClass> seatClasses = seatClassRepository.findAllByEventId(eventId);
        return seatClasses.stream()
                .map(SeatClassMapper::toSeatClassResponse)
                .toList();
    }

    @Override
    public SeatClassResponse updateSeatClass(Long seatClassId, UpdateSeatClassRequest request) {
        SeatClass seatClass = seatClassRepository.findById(seatClassId).orElseThrow(()-> new SeatClassNotFoundException(seatClassId));
        seatClass.setNameEn(request.nameEn());
        seatClass.setNameEn(request.nameKm());
        seatClass.setPriceUsdCents(request.priceUsdCents());
        SeatClass save =  seatClassRepository.save(seatClass);
        return SeatClassMapper.toSeatClassResponse(save);
    }
}
