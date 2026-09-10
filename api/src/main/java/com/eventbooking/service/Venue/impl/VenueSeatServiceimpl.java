package com.eventbooking.service.Venue.impl;

import com.eventbooking.catalog.error.VenueNotFoundException;

import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.VenueSeat.VenueSeatMapResponse;
import com.eventbooking.dto.VenueSeat.VenueSeatResponse;
import com.eventbooking.dto.VenueSeat.VenueSeatSectionResponse;
import com.eventbooking.mapper.Venue.VenueSeatMapper;
import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
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

    private final OrganizerResolver organizerResolver;

    public VenueSeatServiceimpl(VenueSeatRepository venueSeatRepository,
                                VenueRepository venueRepository,
                                OrganizerResolver organizerResolver) {
        this.venueSeatRepository = venueSeatRepository;
        this.venueRepository = venueRepository;
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
