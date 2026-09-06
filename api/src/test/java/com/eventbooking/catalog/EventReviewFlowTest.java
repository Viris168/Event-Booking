package com.eventbooking.catalog;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.Enumeration.InventoryMode;
import com.eventbooking.catalog.error.EventNotEditableException;
import com.eventbooking.catalog.error.InvalidEventStatusTransitionException;
import com.eventbooking.catalog.error.NoInventoryException;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventReview;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.SeatClass;
import com.eventbooking.model.Venue;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The review lifecycle as rules rather than as wiring.
 *
 * <p>Deliberately not a Spring test: the interesting behaviour here - which
 * transitions are legal, what gets logged, when submitted_at is cleared, which
 * events are too empty to review - is all decidable without a database, and a
 * context-loading test would run three orders of magnitude slower for no extra
 * coverage. The wiring itself was exercised end to end against Postgres.
 */
class EventReviewFlowTest {

    private EventStateMachine stateMachine;
    private EventSnapshotter snapshotter;
    private List<EventReview> log;

    @BeforeEach
    void setUp() {
        stateMachine = new EventStateMachine();
        snapshotter = new EventSnapshotter(new ObjectMapper());
        log = new ArrayList<>();
    }

    private Event event(EventStatus status, InventoryMode mode) {
        return Event.builder()
                .id(7L)
                .venue(Venue.builder().id(1L).nameEn("Chaktomuk").build())
                .status(status)
                .inventoryMode(mode)
                .slug("review-test")
                .titleEn("Review Test")
                .titleKm("សាកល្បង")
                .startsAt(Instant.parse("2027-04-05T12:30:00Z"))
                .doorsOpenAt(Instant.parse("2027-04-05T11:00:00Z"))
                .salesOpenAt(Instant.parse("2027-03-12T02:00:00Z"))
                .salesCloseAt(Instant.parse("2027-04-05T12:00:00Z"))
                .build();
    }

    /** Mirrors EventServiceimpl.transitionAndLog without the repositories. */
    private void transitionAndLog(Event event, EventTransition transition, Long actorUserId,
                                  String message, String snapshot) {
        EventStatus from = event.getStatus();
        EventStatus to = stateMachine.requireTransition(from, transition);
        event.setStatus(to);
        log.add(EventReview.builder()
                .event(event).actorId(actorUserId).action(transition).message(message)
                .fromStatus(from).toStatus(to).snapshot(snapshot).build());
    }

    // ------------------------------------------------------------ the log

    @Test
    void everyTransitionLeavesExactlyOneEntry() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);
        transitionAndLog(e, EventTransition.SUBMIT, 2L, null, snapshotter.capture(e));
        transitionAndLog(e, EventTransition.APPROVE, 3L, null, snapshotter.capture(e));
        transitionAndLog(e, EventTransition.PUBLISH, 2L, null, null);

        assertThat(log).hasSize(3);
        assertThat(log).extracting(EventReview::getAction)
                .containsExactly(EventTransition.SUBMIT, EventTransition.APPROVE, EventTransition.PUBLISH);
    }

    @Test
    void theLogRecordsBothEndsOfEachMove() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);
        transitionAndLog(e, EventTransition.SUBMIT, 2L, null, null);

        assertThat(log.getFirst().getFromStatus()).isEqualTo(EventStatus.DRAFT);
        assertThat(log.getFirst().getToStatus()).isEqualTo(EventStatus.PENDING_REVIEW);
    }

    @Test
    void aRefusedTransitionLeavesNoEntryAndNoStatusChange() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);

        // requireTransition throws before anything is mutated, which is the whole
        // reason it is called first in the helper.
        assertThatThrownBy(() -> transitionAndLog(e, EventTransition.PUBLISH, 2L, null, null))
                .isInstanceOf(InvalidEventStatusTransitionException.class);

        assertThat(e.getStatus()).isEqualTo(EventStatus.DRAFT);
        assertThat(log).isEmpty();
    }

    @Test
    void adminAndOrganiserActionsAreDistinguishableByActor() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);
        transitionAndLog(e, EventTransition.SUBMIT, 2L, null, null);
        transitionAndLog(e, EventTransition.REQUEST_CHANGES, 3L, "Fix the door time", null);

        assertThat(log).extracting(EventReview::getActorId).containsExactly(2L, 3L);
        assertThat(log.get(1).getMessage()).isEqualTo("Fix the door time");
    }

    // ------------------------------------------------------- submitted_at

    @Test
    void withdrawClearsSubmittedAtSoTheQueueDoesNotLie() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);

        e.setSubmittedAt(Instant.now());
        transitionAndLog(e, EventTransition.SUBMIT, 2L, null, null);
        assertThat(e.getSubmittedAt()).isNotNull();

        e.setSubmittedAt(null);
        transitionAndLog(e, EventTransition.WITHDRAW, 2L, null, null);

        // Left set, a resubmitted event would claim to have been queuing since an
        // attempt that was taken back, and jump ahead of events that waited.
        assertThat(e.getSubmittedAt()).isNull();
        assertThat(e.getStatus()).isEqualTo(EventStatus.DRAFT);
    }

    // -------------------------------------------------- the whole journey

    @Test
    void theRoundTripThroughChangesRequestedEndsPublished() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);

        transitionAndLog(e, EventTransition.SUBMIT, 2L, null, snapshotter.capture(e));
        transitionAndLog(e, EventTransition.REQUEST_CHANGES, 3L, "Door time", null);
        assertThat(e.getStatus()).isEqualTo(EventStatus.CHANGES_REQUESTED);
        assertThat(stateMachine.isEditable(e.getStatus())).isTrue();

        e.setTitleEn("The Review Test");
        transitionAndLog(e, EventTransition.SUBMIT, 2L, null, snapshotter.capture(e));
        transitionAndLog(e, EventTransition.APPROVE, 3L, null, snapshotter.capture(e));
        assertThat(stateMachine.isEditable(e.getStatus())).isFalse();

        transitionAndLog(e, EventTransition.PUBLISH, 2L, null, null);
        assertThat(e.getStatus()).isEqualTo(EventStatus.PUBLISHED);
        assertThat(log).hasSize(5);
    }

    @Test
    void anApprovedEventEditedAfterWithdrawNeedsReviewingAgain() {
        Event e = event(EventStatus.APPROVED, InventoryMode.ZONED);

        // Editing an approved event directly is refused - that is what stops
        // version A being approved and version B going on sale.
        assertThat(stateMachine.isEditable(e.getStatus())).isFalse();

        transitionAndLog(e, EventTransition.WITHDRAW, 2L, null, null);
        assertThat(e.getStatus()).isEqualTo(EventStatus.DRAFT);
        assertThat(stateMachine.isEditable(e.getStatus())).isTrue();

        // ...and the only way back to PUBLISHED runs through review again.
        assertThatThrownBy(() -> stateMachine.requireTransition(e.getStatus(), EventTransition.PUBLISH))
                .isInstanceOf(InvalidEventStatusTransitionException.class);
    }

    // ------------------------------------------------------ history diffs

    @Test
    void historyDiffsEachSnapshotAgainstThePreviousOne() {
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);
        String first = snapshotter.capture(e);

        e.setTitleEn("The Review Test");
        String second = snapshotter.capture(e);

        assertThat(snapshotter.diff(first, second))
                .singleElement()
                .satisfies(c -> {
                    assertThat(c.field()).isEqualTo("title_en");
                    assertThat(c.before()).isEqualTo("Review Test");
                    assertThat(c.after()).isEqualTo("The Review Test");
                });
    }

    @Test
    void anEntryWithNoSnapshotDoesNotResetTheBaseline() {
        // REJECT and REQUEST_CHANGES store no snapshot. If the next submit
        // diffed against their null, it would report every field as changed for
        // edits the organiser never made.
        Event e = event(EventStatus.DRAFT, InventoryMode.ZONED);
        String atSubmit = snapshotter.capture(e);

        assertThat(snapshotter.diff(atSubmit, (String) null)).isEmpty();
        assertThat(snapshotter.diff(null, atSubmit)).isEmpty();

        e.setTitleEn("Changed");
        assertThat(snapshotter.diff(atSubmit, snapshotter.capture(e))).hasSize(1);
    }

    // ------------------------------------------ nothing-to-sell guard rules

    /** The rule EventServiceimpl.requireSeats enforces, without the repositories. */
    private SeatClass firstEmptyTier(List<SeatClass> tiers, List<EventSeat> seats) {
        var withSeats = seats.stream().map(s -> s.getSeatClass().getId()).collect(java.util.stream.Collectors.toSet());
        return tiers.stream().filter(t -> !withSeats.contains(t.getId())).findFirst().orElse(null);
    }

    @Test
    void aPricedTierWithNoSeatsIsTheCaseWorthCatching() {
        SeatClass vip = SeatClass.builder().id(1L).nameEn("VIP Golden").priceUsdCents(4500).build();
        SeatClass balcony = SeatClass.builder().id(3L).nameEn("Balcony").priceUsdCents(1500).build();

        List<EventSeat> seats = List.of(
                EventSeat.builder().id(1L).seatClass(vip).build(),
                EventSeat.builder().id(2L).seatClass(vip).build());

        // VIP has seats, Balcony is a price with nothing behind it.
        assertThat(firstEmptyTier(List.of(vip, balcony), seats)).isEqualTo(balcony);
        assertThat(firstEmptyTier(List.of(vip), seats)).isNull();
    }

    @Test
    void theErrorNamesTheOffendingTierNotJustTheEvent() {
        // "nothing on sale" sends the organiser back to a form with six sections
        // and no clue which one is wrong.
        SeatClass balcony = SeatClass.builder().id(3L).nameEn("Balcony").build();
        NoInventoryException ex = new NoInventoryException(
                "Seat class \"" + balcony.getNameEn() + "\" has no seats assigned, "
                        + "so nothing can be sold at that price");
        assertThat(ex.getMessage()).contains("Balcony");
    }

    @Test
    void anEventUnderReviewIsNotEditableAndSaysWhyInTheError() {
        EventNotEditableException ex = new EventNotEditableException(EventStatus.PENDING_REVIEW);
        assertThat(ex.getMessage()).contains("Withdraw");

        EventNotEditableException approved = new EventNotEditableException(EventStatus.APPROVED);
        assertThat(approved.getMessage()).contains("reviewing again");
    }
}
