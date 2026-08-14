package com.eventbooking.service.Venue.impl;


import com.eventbooking.catalog.error.InventoryModeMismatchException;
import com.eventbooking.catalog.error.VenueNotFoundException;
import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.mapper.Venue.VenueMapper;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.service.Venue.VenueService;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class VenueServiceimpl implements VenueService {

    private final VenueRepository venueRepository;

    public VenueServiceimpl(VenueRepository venueRepository) {
        this.venueRepository = venueRepository;
    }

    @Override
    public VenueResponse createVenue(CreateVenueRequest request) {
        Venue venue = VenueMapper.toVenue(request, request.organizerId());
        venueRepository.save(venue);
        return VenueMapper.toVenueResponse(venue);
    }

    @Override
    public VenueResponse getVenue(Long venueId) {
        Venue v = venueRepository.findById(venueId).orElseThrow(() -> new VenueNotFoundException(venueId));
        return VenueMapper.toVenueResponse(v);
    }

    @Override
    public VenueResponse updateVenue(Long venueId, UpdateVenueRequest request) {
        Venue v = venueRepository.findById(venueId).orElseThrow(() -> new VenueNotFoundException(venueId));
                        v.setNameEn(request.nameEn());
                        v.setNameKm(request.nameKm());
                        v.setProvinceCode(request.provinceCode());
                        v.setKhanDistrict(request.khanDistrict());
                        v.setSangkatCommune(request.sangkatCommune());
                        v.setStreetAddress(request.streetAddress());
                        v.setLat(request.lat());
                        v.setLng(request.lng());
        Venue saved = venueRepository.save(v);
        return VenueMapper.toVenueResponse(saved);
    }

    @Override
    public void deactivateVenue(Long venueId) {
        Venue v = venueRepository.findById(venueId).orElseThrow(() -> new VenueNotFoundException(venueId));
        v.setIsDisabled(true);
        venueRepository.save(v);
    }


}
