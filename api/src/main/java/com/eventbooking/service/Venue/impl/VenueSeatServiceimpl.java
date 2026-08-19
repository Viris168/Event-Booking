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

import com.eventbooking.service.Venue.VenueSeatService;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import java.util.List;


@Service
public class VenueSeatServiceimpl implements VenueSeatService {

    private final VenueSeatRepository venueSeatRepository;
    private final VenueRepository venueRepository;

    public VenueSeatServiceimpl(VenueSeatRepository venueSeatRepository, VenueRepository venueRepository) {
        this.venueSeatRepository = venueSeatRepository;
        this.venueRepository = venueRepository;
    }

    @Override
    public VenueSeatMapResponse createVenueSeats(CreateVenueSeatsRequest request) {
        Venue venue = venueRepository.findById(request.venueId())
                .orElseThrow(() -> new VenueNotFoundException(request.venueId()));
                
        List<VenueSeat> venueSeats = VenueSeatMapper.toVenueSeat(request, venue);
        venueSeatRepository.saveAll(venueSeats);

        return buildSeatMap(request.venueId());
    }

    @Override
    public VenueSeatMapResponse getVenueSeatMap(Long venueId) {
        if (!venueRepository.existsById(venueId)) {
            throw new VenueNotFoundException(venueId);
        }
        return buildSeatMap(venueId);
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
                                    seat.getVenue().getId(),
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
