package com.eventbooking.service.Venue.impl;

import com.eventbooking.exception.catalog.VenueNotFoundException;
import com.eventbooking.exception.catalog.VenueSeatsInUseException;

import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.VenueSeat.VenueSeatMapResponse;
import com.eventbooking.dto.VenueSeat.VenueSeatResponse;
import com.eventbooking.dto.VenueSeat.VenueSeatSectionResponse;
import com.eventbooking.mapper.Venue.VenueSeatMapper;
import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.repository.VenueSeatRepository;

import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Venue.VenueSeatService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;


@Service
public class VenueSeatServiceimpl implements VenueSeatService {

    private final VenueSeatRepository venueSeatRepository;
    private final VenueRepository venueRepository;
    private final EventSeatRepository eventSeatRepository;

    private final OrganizerResolver organizerResolver;

    public VenueSeatServiceimpl(VenueSeatRepository venueSeatRepository,
                                VenueRepository venueRepository,
                                EventSeatRepository eventSeatRepository,
                                OrganizerResolver organizerResolver) {
        this.venueSeatRepository = venueSeatRepository;
        this.venueRepository = venueRepository;
        this.eventSeatRepository = eventSeatRepository;
        this.organizerResolver = organizerResolver;
    }

    @Override
    @Transactional
    public VenueSeatMapResponse createVenueSeats(Long organizerId, Long venueId, CreateVenueSeatsRequest request) {
        Venue venue = venueRepository.findById(venueId)
                .orElseThrow(() -> new VenueNotFoundException(venueId));
        organizerResolver.requireOwner(organizerId, venue.getOrganizerId(), "venue", venueId);
                
        // Re-posting a layout is how a second event gets run off the same
        // venue, so seats already on file are skipped instead of colliding
        // with UNIQUE (venue_id, section_label, row_label, seat_number) - an
        // unnamed constraint the translator cannot match, so the collision
        // surfaced as a raw 500. Duplicates *within* one request are already
        // rejected by CreateVenueSeatsRequest's @AssertTrue.
        Set<List<String>> existing = venueSeatRepository.findByVenueId(venue.getId()).stream()
                .map(VenueSeatServiceimpl::locationKey)
                .collect(Collectors.toSet());

        List<VenueSeat> venueSeats = VenueSeatMapper.toVenueSeat(request, venue).stream()
                .filter(seat -> !existing.contains(locationKey(seat)))
                .toList();

        venueSeatRepository.saveAll(venueSeats);

        return buildSeatMap(venueId);
    }

    @Override
    @Transactional(readOnly = true)
    public VenueSeatMapResponse getVenueSeatMap(Long venueId) {
        if (!venueRepository.existsById(venueId)) {
            throw new VenueNotFoundException(venueId);
        }
        return buildSeatMap(venueId);
    }

    /**
     * Remove one section from a venue's map.
     *
     * <p><b>Only while nothing has been built on it.</b> The seat map is
     * append-only for a reason - every event at this venue points at these rows
     * and tickets reach back through them - so the useful case this opens up is
     * the narrow one: a section generated wrong minutes ago, before any event
     * used it. Once an event_seat row exists the section stays, and the caller
     * is told which events to deal with first.
     *
     * <p>Returns the remaining map, the same shape create does, so the editor
     * redraws from the server rather than from its own guess about what is left.
     */
    @Override
    @Transactional
    public VenueSeatMapResponse deleteSection(Long organizerId, Long venueId, String sectionLabel) {
        Venue venue = venueRepository.findById(venueId)
                .orElseThrow(() -> new VenueNotFoundException(venueId));
        organizerResolver.requireOwner(organizerId, venue.getOrganizerId(), "venue", venueId);

        List<VenueSeat> seats = venueSeatRepository.findByVenueIdAndSectionLabel(venueId, sectionLabel);
        // A section that is not there is not an error worth a 404: the caller
        // wanted it gone and it is gone. Deleting the same section twice - two
        // clicks, a retried request - lands here and should look like success.
        if (seats.isEmpty()) {
            return buildSeatMap(venueId);
        }

        List<Long> seatIds = seats.stream().map(VenueSeat::getId).toList();
        List<Long> eventIds = eventSeatRepository.findEventIdsUsingVenueSeats(seatIds);
        if (!eventIds.isEmpty()) {
            throw new VenueSeatsInUseException(sectionLabel, eventIds);
        }

        venueSeatRepository.deleteAll(seats);
        return buildSeatMap(venueId);
    }

    private static List<String> locationKey(VenueSeat seat) {
        return List.of(seat.getSectionLabel(), seat.getRowLabel(), seat.getSeatNumber());
    }

    private VenueSeatMapResponse buildSeatMap(Long venueId) {
        List<VenueSeat> allSeats = venueSeatRepository.findByVenueId(venueId);

        // Group seats by their section label
        Map<String, List<VenueSeat>> groupedBySection = allSeats.stream()
                .collect(Collectors.groupingBy(VenueSeat::getSectionLabel));

        // Map each group into a VenueSeatSectionResponse
        List<VenueSeatSectionResponse> sections = groupedBySection.entrySet().stream()
                .map(entry -> {
                    String sectionLabel = entry.getKey();
                    List<VenueSeatResponse> seatResponses = entry.getValue().stream()
                            .map(seat -> new VenueSeatResponse(
                                    seat.getId(),
                                    venueId,
                                    seat.getSectionLabel(),
                                    seat.getRowLabel(),
                                    seat.getSeatNumber(),
                                    seat.getPosX(),
                                    seat.getPosY()
                            ))
                            .toList();
                    return new VenueSeatSectionResponse(sectionLabel, seatResponses);
                })
                .toList();

        return new VenueSeatMapResponse(venueId, sections);
    }
}
