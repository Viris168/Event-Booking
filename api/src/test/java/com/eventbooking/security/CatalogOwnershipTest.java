package com.eventbooking.security;

import com.eventbooking.catalog.error.SeatClassNotFoundException;
import com.eventbooking.catalog.error.VenueSeatNotFoundException;
import com.eventbooking.dto.VenueSeat.CreateVenueSeatsRequest;
import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.UpdateZoneRequest;
import com.eventbooking.dto.seatclass.CreateSeatClassRequest;
import com.eventbooking.dto.seatclass.UpdateSeatClassRequest;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.Venue;
import com.eventbooking.model.VenueSeat;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.repository.VenueSeatRepository;
import com.eventbooking.security.error.NotResourceOwnerException;
import com.eventbooking.service.Seatclass.impl.SeatClassServiceimpl;
import com.eventbooking.service.Venue.impl.VenueSeatServiceimpl;
import com.eventbooking.service.event.impl.EventSeatServiceimpl;
import com.eventbooking.service.event.impl.EventZoneServiceimpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Every catalog write refuses an organiser who does not own the row.
 *
 * <p>These four services were reachable over HTTP with no caller check at all:
 * zones could be created, re-priced and deactivated on anyone's event, seats
 * generated on anyone's event, tiers priced on anyone's event, and seats
 * written into anyone's venue. The endpoints existed, the React client called
 * them, and nothing asked who was calling.
 *
 * <p>The tests assert the refusal <em>and</em> that nothing was saved. A check
 * that throws after the write is not a check, and only the second assertion can
 * tell the difference.
 *
 * <p>Mocked repositories rather than a database: ownership is a comparison of
 * two ids, decidable without Postgres, and the point is that the comparison
 * happens at all.
 */
class CatalogOwnershipTest {

    /** The caller. Owns nothing below. */
    private static final Long INTRUDER = 99L;
    /** The organiser every fixture below actually belongs to. */
    private static final Long OWNER = 1L;

    private EventRepository eventRepository;
    private EventZoneRepository eventZoneRepository;
    private SeatClassRepository seatClassRepository;
    private VenueRepository venueRepository;
    private VenueSeatRepository venueSeatRepository;
    private EventSeatRepository eventSeatRepository;
    private OrganizerResolver organizerResolver;

    @BeforeEach
    void setUp() {
        eventRepository = mock(EventRepository.class);
        eventZoneRepository = mock(EventZoneRepository.class);
        seatClassRepository = mock(SeatClassRepository.class);
        venueRepository = mock(VenueRepository.class);
        venueSeatRepository = mock(VenueSeatRepository.class);
        eventSeatRepository = mock(EventSeatRepository.class);
        // The real one: requireOwner is the rule under test, not a stub of it.
        organizerResolver = new OrganizerResolver(null);
    }

    private Venue venue() {
        return Venue.builder().id(3L).organizerId(OWNER).build();
    }

    private Event event() {
        return Event.builder().id(7L).organizerId(OWNER).venue(venue()).build();
    }

    // --- zones ------------------------------------------------------------

    @Test
    void createZoneRefusesANonOwner() {
        when(eventRepository.findById(7L)).thenReturn(Optional.of(event()));
        EventZoneServiceimpl service =
                new EventZoneServiceimpl(eventRepository, eventZoneRepository, organizerResolver);

        assertThatThrownBy(() -> service.createZone(
                INTRUDER, 7L, new CreateEventZoneRequest("GA", "ធម្មតា", 1500, 100)))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(eventZoneRepository, never()).save(any());
    }

    @Test
    void updateZoneRefusesANonOwner() {
        when(eventZoneRepository.findById(4L))
                .thenReturn(Optional.of(EventZone.builder().id(4L).event(event()).build()));
        EventZoneServiceimpl service =
                new EventZoneServiceimpl(eventRepository, eventZoneRepository, organizerResolver);

        assertThatThrownBy(() -> service.updateZone(
                INTRUDER, 4L, new UpdateZoneRequest(null, null, 9999, null)))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(eventZoneRepository, never()).save(any());
    }

    /**
     * The worst of the four: a DELETE, on a URL that carried no header at all.
     */
    @Test
    void deactivateZoneRefusesANonOwner() {
        when(eventZoneRepository.findById(4L))
                .thenReturn(Optional.of(EventZone.builder().id(4L).event(event()).build()));
        EventZoneServiceimpl service =
                new EventZoneServiceimpl(eventRepository, eventZoneRepository, organizerResolver);

        assertThatThrownBy(() -> service.deactivateZone(INTRUDER, 4L))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(eventZoneRepository, never()).save(any());
    }

    // --- seat classes -----------------------------------------------------

    @Test
    void createSeatClassRefusesANonOwner() {
        when(eventRepository.findById(7L)).thenReturn(Optional.of(event()));
        SeatClassServiceimpl service =
                new SeatClassServiceimpl(seatClassRepository, eventRepository, organizerResolver);

        assertThatThrownBy(() -> service.createSeatClass(
                INTRUDER, 7L, new CreateSeatClassRequest("VIP", "វីអាយភី", 5000)))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(seatClassRepository, never()).save(any());
    }

    @Test
    void updateSeatClassRefusesANonOwner() {
        when(seatClassRepository.findById(2L))
                .thenReturn(Optional.of(SeatClass.builder().id(2L).event(event()).build()));
        SeatClassServiceimpl service =
                new SeatClassServiceimpl(seatClassRepository, eventRepository, organizerResolver);

        assertThatThrownBy(() -> service.updateSeatClass(
                INTRUDER, 2L, new UpdateSeatClassRequest(null, null, 1)))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(seatClassRepository, never()).save(any());
    }

    // --- venue seats ------------------------------------------------------

    @Test
    void createVenueSeatsRefusesANonOwner() {
        when(venueRepository.findById(3L)).thenReturn(Optional.of(venue()));
        VenueSeatServiceimpl service =
                new VenueSeatServiceimpl(venueSeatRepository, venueRepository, organizerResolver);

        assertThatThrownBy(() -> service.createVenueSeats(INTRUDER, 3L, seatRequest()))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(venueSeatRepository, never()).saveAll(any());
    }

    // --- event seats ------------------------------------------------------

    @Test
    void generateEventSeatsRefusesANonOwner() {
        when(eventRepository.findById(7L)).thenReturn(Optional.of(event()));
        EventSeatServiceimpl service = eventSeatService();

        assertThatThrownBy(() -> service.generateEventSeats(
                INTRUDER, 7L, new GenerateEventSeatsRequest(2L, List.of(11L))))
                .isInstanceOf(NotResourceOwnerException.class);

        verify(eventSeatRepository, never()).saveAll(any());
    }

    /**
     * Owning the event is not enough when the tier id arrives in the body:
     * without this check an organiser could hang another event's pricing on
     * their own seats.
     */
    @Test
    void generateEventSeatsRejectsASeatClassFromAnotherEvent() {
        when(eventRepository.findById(7L)).thenReturn(Optional.of(event()));
        when(venueSeatRepository.findAllById(List.of(11L)))
                .thenReturn(List.of(VenueSeat.builder().id(11L).venue(venue()).build()));
        Event otherEvent = Event.builder().id(8L).organizerId(OWNER).venue(venue()).build();
        when(seatClassRepository.findById(2L))
                .thenReturn(Optional.of(SeatClass.builder().id(2L).event(otherEvent).build()));

        EventSeatServiceimpl service = eventSeatService();

        assertThatThrownBy(() -> service.generateEventSeats(
                OWNER, 7L, new GenerateEventSeatsRequest(2L, List.of(11L))))
                .isInstanceOf(SeatClassNotFoundException.class);

        verify(eventSeatRepository, never()).saveAll(any());
    }

    /**
     * And the seat ids likewise: chairs that stand in a different building
     * cannot be put on sale at this event, however legitimately they were
     * created.
     */
    @Test
    void generateEventSeatsRejectsSeatsFromAnotherVenue() {
        when(eventRepository.findById(7L)).thenReturn(Optional.of(event()));
        Venue otherVenue = Venue.builder().id(4L).organizerId(OWNER).build();
        when(venueSeatRepository.findAllById(List.of(11L)))
                .thenReturn(List.of(VenueSeat.builder().id(11L).venue(otherVenue).build()));
        when(seatClassRepository.findById(2L))
                .thenReturn(Optional.of(SeatClass.builder().id(2L).event(event()).build()));

        EventSeatServiceimpl service = eventSeatService();

        assertThatThrownBy(() -> service.generateEventSeats(
                OWNER, 7L, new GenerateEventSeatsRequest(2L, List.of(11L))))
                .isInstanceOf(VenueSeatNotFoundException.class);

        verify(eventSeatRepository, never()).saveAll(any());
    }

    private EventSeatServiceimpl eventSeatService() {
        return new EventSeatServiceimpl(
                eventSeatRepository, eventRepository, seatClassRepository,
                venueSeatRepository, organizerResolver);
    }

    private CreateVenueSeatsRequest seatRequest() {
        return new CreateVenueSeatsRequest(List.of(
                new CreateVenueSeatsRequest.VenueSeatLine(
                        "A", "1", "1", BigDecimal.ONE, BigDecimal.ONE)));
    }
}
