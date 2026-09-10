package com.eventbooking.service.event;


import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.dto.eventseat.SeatMapResponse;

/**
 * The SEATED tier's inventory: which of the venue's chairs are on sale at this
 * event, and in which pricing tier.
 *
 * <p>Generating seats takes an {@code organizerId}; reading the seat map does
 * not, because the map is what a customer picks from.
 */
public interface EventSeatService {
    SeatMapResponse generateEventSeats(Long organizerId, Long eventId, GenerateEventSeatsRequest request);
    SeatMapResponse getSeatMap(Long eventId);
}
