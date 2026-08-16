package com.eventbooking.mapper.Venue;

import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.venue.CreateVenueRequest;
import com.eventbooking.dto.venue.UpdateVenueRequest;
import com.eventbooking.dto.venue.VenueResponse;
import com.eventbooking.model.Venue;
import org.springframework.stereotype.Component;

@Component
public class VenueMapper {

    public static Venue toVenue(CreateVenueRequest createVenueRequest, Long organizerId) {

        return Venue.builder()
                .organizerId(organizerId)
                .nameEn(createVenueRequest.nameEn())
                .nameKm(createVenueRequest.nameKm())
                .provinceCode(createVenueRequest.provinceCode())
                .khanDistrict(createVenueRequest.khanDistrict())
                .sangkatCommune(createVenueRequest.sangkatCommune())
                .streetAddress(createVenueRequest.streetAddress())
                .lat(createVenueRequest.lat())
                .lng(createVenueRequest.lng())
                .build();
    
    }

    public static VenueResponse toVenueResponse(Venue venue) {
        return new VenueResponse(
                venue.getId(),
                venue.getOrganizerId(),
                venue.getNameEn(),
                venue.getNameKm(),
                venue.getProvinceCode(),
                venue.getKhanDistrict(),
                venue.getSangkatCommune(),
                venue.getStreetAddress(),
                venue.getLat(),
                venue.getLng(),
                venue.getCreatedAt(),
                venue.getIsDisabled()
        );
    }

}
