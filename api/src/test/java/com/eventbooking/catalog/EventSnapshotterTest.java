package com.eventbooking.catalog;

import com.eventbooking.Enumeration.InventoryMode;
import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class EventSnapshotterTest {

    private EventSnapshotter snapshotter;

    @BeforeEach
    void setUp() {
        snapshotter = new EventSnapshotter(new ObjectMapper());
    }

    private Event event() {
        Venue venue = Venue.builder().id(1L).nameEn("Chaktomuk").build();
        return Event.builder()
                .id(7L)
                .venue(venue)
                .slug("royal-ballet-2026")
                .titleEn("Royal Ballet of Cambodia")
                .titleKm("របាំព្រះរាជទ្រព្យ")
                .descriptionEn("An evening of Khmer classical dance.")
                .descriptionKm("ល្ខោនរបាំបុរាណ")
                .category("CULTURE")
                .inventoryMode(InventoryMode.MIXED)
                .startsAt(Instant.parse("2026-04-05T12:30:00Z"))
                .doorsOpenAt(Instant.parse("2026-04-05T11:00:00Z"))
                .salesOpenAt(Instant.parse("2026-03-12T02:00:00Z"))
                .salesCloseAt(Instant.parse("2026-04-05T12:00:00Z"))
                .build();
    }

    @Test
    void anUnchangedEventProducesNoDiff() {
        Event e = event();
        assertThat(snapshotter.diff(snapshotter.capture(e), e)).isEmpty();
    }

    @Test
    void aTitleFixIsTheOnlyLineTheReviewerSees() {
        Event e = event();
        String approved = snapshotter.capture(e);

        e.setTitleEn("The Royal Ballet of Cambodia");

        assertThat(snapshotter.diff(approved, e))
                .singleElement()
                .satisfies(change -> {
                    assertThat(change.field()).isEqualTo("title_en");
                    assertThat(change.before()).isEqualTo("Royal Ballet of Cambodia");
                    assertThat(change.after()).isEqualTo("The Royal Ballet of Cambodia");
                });
    }

    @Test
    void severalChangesComeBackInDisplayOrderNotJsonOrder() {
        Event e = event();
        String approved = snapshotter.capture(e);

        e.setStartsAt(Instant.parse("2026-04-05T13:00:00Z"));
        e.setTitleEn("Changed");

        assertThat(snapshotter.diff(approved, e))
                .extracting(EventSnapshotter.FieldChange::field)
                .containsExactly("title_en", "starts_at");
    }

    @Test
    void aVenueSwapIsCaughtByIdNotByName() {
        Event e = event();
        String approved = snapshotter.capture(e);

        // A venue RENAME must not show up: that is the venue's history, not
        // this event's, and would appear as a change to an event nobody edited.
        e.getVenue().setNameEn("Chaktomuk Conference Hall");
        assertThat(snapshotter.diff(approved, e)).isEmpty();

        // Moving the event to a different venue must.
        e.setVenue(Venue.builder().id(2L).nameEn("Koh Pich").build());
        assertThat(snapshotter.diff(approved, e))
                .singleElement()
                .satisfies(c -> assertThat(c.field()).isEqualTo("venue_id"));
    }

    @Test
    void artworkIsComparedByPresenceNotByPublicId() {
        Event e = event();
        e.setCloudinaryImageId("poster_v1");
        String approved = snapshotter.capture(e);

        // Re-uploading the same picture mints a new public id. Diffing on the
        // id would report a change to an image that looks identical.
        e.setCloudinaryImageId("poster_v2");
        assertThat(snapshotter.diff(approved, e)).isEmpty();

        // Removing it is a real change.
        e.setCloudinaryImageId(null);
        assertThat(snapshotter.diff(approved, e))
                .singleElement()
                .satisfies(c -> {
                    assertThat(c.field()).isEqualTo("has_cover_image");
                    assertThat(c.before()).isEqualTo("true");
                    assertThat(c.after()).isEqualTo("false");
                });
    }

    @Test
    void noBaselineMeansNoDiff_notEverythingChanged() {
        // Events reviewed before snapshots existed have no baseline. Claiming
        // every field is new would be a lie the reviewer has to check.
        assertThat(snapshotter.diff(null, event())).isEmpty();
        assertThat(snapshotter.diff("", event())).isEmpty();
    }

    @Test
    void malformedStoredJsonDegradesToNoDiffRatherThanFailingTheReview() {
        assertThat(snapshotter.diff("{not json", event())).isEmpty();
    }

    @Test
    void nullFieldsRoundTripWithoutBeingReportedAsChanges() {
        Event e = event();
        e.setDescriptionEn(null);
        String approved = snapshotter.capture(e);
        assertThat(snapshotter.diff(approved, e)).isEmpty();
    }
}
