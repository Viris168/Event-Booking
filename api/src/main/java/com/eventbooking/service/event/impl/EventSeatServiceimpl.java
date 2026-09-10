package com.eventbooking.service.event.impl;

import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.SeatClassNotFoundException;
import com.eventbooking.catalog.error.VenueSeatNotFoundException;
import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.dto.eventseat.SeatMapResponse;
import com.eventbooking.mapper.Event.EventSeatMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.VenueSeat;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.repository.VenueSeatRepository;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventSeatService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class EventSeatServiceimpl implements EventSeatService {

    private final EventSeatRepository eventSeatRepository;
    private final EventRepository eventRepository;
    private final SeatClassRepository seatClassRepository;
    private final VenueSeatRepository venueSeatRepository;

    private final OrganizerResolver organizerResolver;

    public EventSeatServiceimpl(EventSeatRepository eventSeatRepository, EventRepository eventRepository, SeatClassRepository seatClassRepository, VenueSeatRepository venueSeatRepository, OrganizerResolver organizerResolver) {
        this.eventSeatRepository = eventSeatRepository;
        this.eventRepository = eventRepository;
        this.seatClassRepository = seatClassRepository;
        this.venueSeatRepository = venueSeatRepository;
        this.organizerResolver = organizerResolver;
    }


    @Override
    @Transactional
    public SeatMapResponse generateEventSeats(Long organizerId, Long eventId, GenerateEventSeatsRequest request) {
        Event event = eventRepository.findById(eventId).orElseThrow( () -> new EventNotFoundException(eventId));
        organizerResolver.requireOwner(organizerId, event.getOrganizerId(), "event", eventId);

        Map<Long, VenueSeat> seatsById =
                venueSeatRepository.findAllById(request.venueSeatIds()).stream()
                        .collect(Collectors.toMap(VenueSeat::getId, Function.identity()));

        List<VenueSeat> venueSeats = request.venueSeatIds().stream()
                        .map(id -> Optional.ofNullable(seatsById.get(id))
                        .orElseThrow(() -> new VenueSeatNotFoundException(id)))
                .toList();

        // Both ids arrive in the body, so owning the event is not enough on its
        // own: without these two checks an organiser could put another event's
        // pricing on their seats, or sell chairs that stand in someone else's
        // building. Reported as not-found rather than forbidden - a caller has
        // no business learning that an id they cannot use exists.
        SeatClass s = seatClassRepository.findById(request.seatClassId()).orElseThrow( () -> new SeatClassNotFoundException(request.seatClassId()));
        if (!s.getEvent().getId().equals(eventId)) {
            throw new SeatClassNotFoundException(request.seatClassId());
        }

        Long venueId = event.getVenue().getId();
        venueSeats.stream()
                .filter(seat -> !seat.getVenue().getId().equals(venueId))
                .findFirst()
                .ifPresent(seat -> { throw new VenueSeatNotFoundException(seat.getId()); });

        List<EventSeat> eventSeat = EventSeatMapper.toEventSeats(event, s, venueSeats);
        
        eventSeatRepository.saveAll(eventSeat);
        
        return buildSeatMap(eventId);
    }

    @Override
    @Transactional(readOnly = true)
    public SeatMapResponse getSeatMap(Long eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new EventNotFoundException(eventId);
        }
        return buildSeatMap(eventId);
    }

    private SeatMapResponse buildSeatMap(Long eventId) {
        List<EventSeat> allSeats = eventSeatRepository.findByEventId(eventId);

        // Group seats by their section label
        Map<String, List<EventSeat>> groupedBySection = allSeats.stream()
                .collect(Collectors.groupingBy(seat -> seat.getVenueSeat().getSectionLabel()));

        // Map each group into a SeatSectionResponse
        List<com.eventbooking.dto.eventseat.SeatSectionResponse> sections = groupedBySection.entrySet().stream()
                .map(entry -> {
                    String sectionLabel = entry.getKey();
                    List<com.eventbooking.dto.eventseat.EventSeatResponse> seatResponses = entry.getValue().stream()
                            .map(seat -> new com.eventbooking.dto.eventseat.EventSeatResponse(
                                    seat.getId(),
                                    seat.getEvent().getId(),
                                    seat.getVenueSeat().getId(),
                                    seat.getVenueSeat().getSectionLabel(),
                                    seat.getVenueSeat().getRowLabel(),
                                    seat.getVenueSeat().getSeatNumber(),
                                    seat.getVenueSeat().getPosX(),
                                    seat.getVenueSeat().getPosY(),
                                    seat.getSeatClass().getId(),
                                    seat.getSeatClass().getNameEn(),
                                    seat.getSeatClass().getPriceUsdCents(),
                                    seat.getStatus(),
                                    seat.getHoldId(),
                                    seat.getHoldExpiresAt(),
                                    seat.getVersion()
                            ))
                            .toList();
                    return new com.eventbooking.dto.eventseat.SeatSectionResponse(sectionLabel, seatResponses);
                })
                .toList();

        return new SeatMapResponse(eventId, sections);
    }
}
