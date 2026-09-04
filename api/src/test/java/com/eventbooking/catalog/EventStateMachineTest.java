package com.eventbooking.catalog;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.catalog.error.InvalidEventStatusTransitionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Set;

import static com.eventbooking.Enumeration.EventStatus.APPROVED;
import static com.eventbooking.Enumeration.EventStatus.CHANGES_REQUESTED;
import static com.eventbooking.Enumeration.EventStatus.DRAFT;
import static com.eventbooking.Enumeration.EventStatus.PENDING_REVIEW;
import static com.eventbooking.Enumeration.EventStatus.PUBLISHED;
import static com.eventbooking.Enumeration.EventStatus.REJECTED;
import static com.eventbooking.Enumeration.EventStatus.TAKEN_DOWN;
import static com.eventbooking.Enumeration.EventTransition.APPROVE;
import static com.eventbooking.Enumeration.EventTransition.PUBLISH;
import static com.eventbooking.Enumeration.EventTransition.REJECT;
import static com.eventbooking.Enumeration.EventTransition.REQUEST_CHANGES;
import static com.eventbooking.Enumeration.EventTransition.SUBMIT;
import static com.eventbooking.Enumeration.EventTransition.TAKE_DOWN;
import static com.eventbooking.Enumeration.EventTransition.WITHDRAW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pure logic, no database - which means this can be exhaustive over the enum
 * rather than sampling it. The point of the exhaustive tests is that adding a
 * status later fails here loudly instead of quietly acquiring edges nobody
 * declared.
 */
class EventStateMachineTest {

    private EventStateMachine stateMachine;

    @BeforeEach
    void setUp() {
        stateMachine = new EventStateMachine();
    }

    // ---------------------------------------------------------------- happy path

    @Test
    void submitMovesADraftIntoTheQueue() {
        assertThat(stateMachine.requireTransition(DRAFT, SUBMIT)).isEqualTo(PENDING_REVIEW);
    }

    @Test
    void aChangesRequestedEventCanBeResubmitted() {
        assertThat(stateMachine.requireTransition(CHANGES_REQUESTED, SUBMIT)).isEqualTo(PENDING_REVIEW);
    }

    @Test
    void theOrganiserCanTakeItBackOutOfTheQueue() {
        assertThat(stateMachine.requireTransition(PENDING_REVIEW, WITHDRAW)).isEqualTo(DRAFT);
    }

    @Test
    void adminDecisionsAllLeaveTheQueue() {
        assertThat(stateMachine.requireTransition(PENDING_REVIEW, APPROVE)).isEqualTo(APPROVED);
        assertThat(stateMachine.requireTransition(PENDING_REVIEW, REJECT)).isEqualTo(REJECTED);
        assertThat(stateMachine.requireTransition(PENDING_REVIEW, REQUEST_CHANGES)).isEqualTo(CHANGES_REQUESTED);
    }

    @Test
    void approvalAndPublicationAreSeparateSteps() {
        // Approval does not put the event on sale; the organiser still chooses
        // the moment. That separation is the whole reason APPROVED exists.
        assertThat(stateMachine.requireTransition(PENDING_REVIEW, APPROVE)).isEqualTo(APPROVED);
        assertThat(stateMachine.requireTransition(APPROVED, PUBLISH)).isEqualTo(PUBLISHED);
    }

    @Test
    void takedownActsOnlyOnSomethingThatWasOnSale() {
        assertThat(stateMachine.requireTransition(PUBLISHED, TAKE_DOWN)).isEqualTo(TAKEN_DOWN);
    }

    // ------------------------------------------------------- the bugs this closes

    @Test
    void aDraftCannotBePublishedWithoutReview() {
        // The old publishEvent allowed exactly this, which made review optional.
        assertThatThrownBy(() -> stateMachine.requireTransition(DRAFT, PUBLISH))
                .isInstanceOf(InvalidEventStatusTransitionException.class)
                .hasMessageContaining("PUBLISH")
                .hasMessageContaining("DRAFT");
    }

    @Test
    void anEventWaitingForReviewCannotBePublished() {
        assertThatThrownBy(() -> stateMachine.requireTransition(PENDING_REVIEW, PUBLISH))
                .isInstanceOf(InvalidEventStatusTransitionException.class);
    }

    @Test
    void aDraftCannotBeTakenDown() {
        // The old takeDownEvent allowed anything that was not already
        // TAKEN_DOWN, so an event that had never been on sale could be.
        assertThatThrownBy(() -> stateMachine.requireTransition(DRAFT, TAKE_DOWN))
                .isInstanceOf(InvalidEventStatusTransitionException.class);
    }

    @Test
    void aQueuedEventCannotBeTakenDownBehindTheReviewersBack() {
        assertThatThrownBy(() -> stateMachine.requireTransition(PENDING_REVIEW, TAKE_DOWN))
                .isInstanceOf(InvalidEventStatusTransitionException.class);
    }

    @Test
    void anEventCannotBeApprovedWithoutBeingSubmitted() {
        assertThatThrownBy(() -> stateMachine.requireTransition(DRAFT, APPROVE))
                .isInstanceOf(InvalidEventStatusTransitionException.class);
    }

    // -------------------------------------------------------------- terminality

    @ParameterizedTest
    @EnumSource(EventTransition.class)
    void rejectedIsTerminal(EventTransition transition) {
        assertThat(stateMachine.canTransition(REJECTED, transition)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(EventTransition.class)
    void takenDownIsTerminal(EventTransition transition) {
        assertThat(stateMachine.canTransition(TAKEN_DOWN, transition)).isFalse();
    }

    @Test
    void aRejectedEventIsNotRevived_itIsDuplicated() {
        assertThatThrownBy(() -> stateMachine.requireTransition(REJECTED, SUBMIT))
                .isInstanceOf(InvalidEventStatusTransitionException.class);
    }

    // --------------------------------------------------------------- exhaustive

    /**
     * Every edge in the table, and nothing else. Written out longhand so that a
     * new status or transition added without a deliberate decision here shows up
     * as a failure rather than as silence.
     */
    @Test
    void theTableIsExactlyTheseNineEdges() {
        record Edge(EventStatus from, EventTransition via) {}
        Set<Edge> legal = Set.of(
                new Edge(DRAFT, SUBMIT),
                new Edge(CHANGES_REQUESTED, SUBMIT),
                new Edge(PENDING_REVIEW, WITHDRAW),
                new Edge(PENDING_REVIEW, APPROVE),
                new Edge(PENDING_REVIEW, REJECT),
                new Edge(PENDING_REVIEW, REQUEST_CHANGES),
                new Edge(APPROVED, PUBLISH),
                new Edge(APPROVED, WITHDRAW),
                new Edge(PUBLISHED, TAKE_DOWN));

        for (EventStatus from : EventStatus.values()) {
            for (EventTransition via : EventTransition.values()) {
                boolean expected = legal.contains(new Edge(from, via));
                assertThat(stateMachine.canTransition(from, via))
                        .as("%s --%s-->", from, via)
                        .isEqualTo(expected);
            }
        }
    }

    @Test
    void everyNonTerminalStatusCanBeLeft() {
        for (EventStatus from : EventStatus.values()) {
            if (from == REJECTED || from == TAKEN_DOWN) continue;
            boolean hasAnyEdge = false;
            for (EventTransition via : EventTransition.values()) {
                hasAnyEdge |= stateMachine.canTransition(from, via);
            }
            assertThat(hasAnyEdge).as("%s is a dead end", from).isTrue();
        }
    }

    // ------------------------------------------------------- 3b: the way back

    @Test
    void anApprovedEventCanBeWithdrawnForAFix() {
        // Without this edge APPROVED is a trap: the event is not editable, and
        // PUBLISH was its only exit - so a typo spotted after approval could
        // only be published or abandoned.
        assertThat(stateMachine.requireTransition(APPROVED, WITHDRAW)).isEqualTo(DRAFT);
    }

    // ------------------------------------------------------- 3b: editability

    @Test
    void onlyTheOrganisersOwnStatesAreEditable() {
        assertThat(stateMachine.isEditable(DRAFT)).isTrue();
        assertThat(stateMachine.isEditable(CHANGES_REQUESTED)).isTrue();
        assertThat(stateMachine.isEditable(PUBLISHED)).isTrue();   // unchanged, deliberately
    }

    @Test
    void anEventUnderSomeoneElsesDecisionIsNotEditable() {
        // PENDING_REVIEW: an admin is reading it.
        // APPROVED: editing after approval would put version B on sale against
        // a review of version A.
        assertThat(stateMachine.isEditable(PENDING_REVIEW)).isFalse();
        assertThat(stateMachine.isEditable(APPROVED)).isFalse();
    }

    @Test
    void terminalStatesAreNotEditable() {
        assertThat(stateMachine.isEditable(REJECTED)).isFalse();
        assertThat(stateMachine.isEditable(TAKEN_DOWN)).isFalse();
    }

    // ---------------------------------------------- 3a: what the UI renders

    @Test
    void availableTransitionsDrivesTheFooterButtons() {
        assertThat(stateMachine.availableTransitions(DRAFT))
                .containsExactly(SUBMIT);
        assertThat(stateMachine.availableTransitions(PENDING_REVIEW))
                .containsExactlyInAnyOrder(WITHDRAW, APPROVE, REJECT, REQUEST_CHANGES);
        assertThat(stateMachine.availableTransitions(APPROVED))
                .containsExactlyInAnyOrder(PUBLISH, WITHDRAW);
        assertThat(stateMachine.availableTransitions(PUBLISHED))
                .containsExactly(TAKE_DOWN);
    }

    @Test
    void terminalStatesOfferNoActions() {
        assertThat(stateMachine.availableTransitions(REJECTED)).isEmpty();
        assertThat(stateMachine.availableTransitions(TAKEN_DOWN)).isEmpty();
    }

    @Test
    void availableTransitionsAgreesWithCanTransition() {
        // Two ways of asking the same question; a UI built on the first and a
        // service guarding with the second must never disagree.
        for (EventStatus from : EventStatus.values()) {
            for (EventTransition via : EventTransition.values()) {
                assertThat(stateMachine.availableTransitions(from).contains(via))
                        .as("%s --%s-->", from, via)
                        .isEqualTo(stateMachine.canTransition(from, via));
            }
        }
    }

    @Test
    void everyEditableStateCanBeSubmittedOrIsAlreadyLive() {
        // An editable state the organiser cannot move out of would be a dead
        // end they can type into forever.
        for (EventStatus from : EventStatus.values()) {
            if (!stateMachine.isEditable(from)) continue;
            assertThat(stateMachine.availableTransitions(from))
                    .as("%s is editable but offers no action", from)
                    .isNotEmpty();
        }
    }
}
