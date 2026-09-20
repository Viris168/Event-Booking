package com.eventbooking.service.Venue.impl;


import com.eventbooking.exception.catalog.VenueNotFoundException;
import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.mapper.Venue.VenueMapper;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Venue.VenueService;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class VenueServiceimpl implements VenueService {

    private final VenueRepository venueRepository;
    private final OrganizerResolver organizerResolver;

    public VenueServiceimpl(VenueRepository venueRepository, OrganizerResolver organizerResolver) {
        this.venueRepository = venueRepository;
        this.organizerResolver = organizerResolver;
    }

    @Override
    public VenueResponse createVenue(Long organizerId, CreateVenueRequest request) {
        Venue venue = VenueMapper.toVenue(request, organizerId);
        venueRepository.save(venue);
        return VenueMapper.toVenueResponse(venue);
    }

    @Override
    public VenueResponse getVenue(Long venueId) {
        Venue v = venueRepository.findById(venueId).orElseThrow(() -> new VenueNotFoundException(venueId));
        return VenueMapper.toVenueResponse(v);
    }

    /**
     * The caller's own venues, active ones only.
     *
     * <p>This used to be getAllVenues() and returned every venue on the
     * platform. That was the listing half of shared venues: any organiser could
     * see every other organiser's buildings and pick one in the event form.
     * Venues are private now, so the list is scoped to their owner and the
     * authorization below refuses the rest.
     */
    @Override
    public List<VenueResponse> getVenuesForOrganizer(Long organizerId) {
        return venueRepository.findAllByOrganizerIdAndIsDisabledFalse(organizerId)
                .stream()
                .map(VenueMapper::toVenueResponse)
                .collect(Collectors.toList());
    }

    @Override
    public VenueResponse updateVenue(Long organizerId, Long venueId, UpdateVenueRequest request) {
        Venue v = venueRepository.findById(venueId).orElseThrow(() -> new VenueNotFoundException(venueId));
        organizerResolver.requireOwner(organizerId, v.getOrganizerId(), "venue", venueId);
        if (request.nameEn() != null) v.setNameEn(request.nameEn());
        if (request.nameKm() != null) v.setNameKm(request.nameKm());
        if (request.provinceCode() != null) v.setProvinceCode(request.provinceCode());
        if (request.khanDistrict() != null) v.setKhanDistrict(request.khanDistrict());
        if (request.sangkatCommune() != null) v.setSangkatCommune(request.sangkatCommune());
        if (request.streetAddress() != null) v.setStreetAddress(request.streetAddress());
        v.setLat(request.lat());
        v.setLng(request.lng());
        Venue saved = venueRepository.save(v);
        return VenueMapper.toVenueResponse(saved);
    }

    @Override
    public void deactivateVenue(Long organizerId, Long venueId) {
        Venue v = venueRepository.findById(venueId).orElseThrow(() -> new VenueNotFoundException(venueId));
        organizerResolver.requireOwner(organizerId, v.getOrganizerId(), "venue", venueId);
        v.setIsDisabled(true);
        venueRepository.save(v);
    }


}
