package com.eventbooking.catalog;

import com.eventbooking.service.event.EventStateMachine;
import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
import com.eventbooking.exception.catalog.InvalidEventStatusTransitionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.List;
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
import static com.eventbooking.Enumeration.EventTransition.RESTORE;
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

    /**
     * TAKEN_DOWN used to be terminal alongside REJECTED, and this test used to
     * assert it. It is not any more: the admin screens grew an "open again"
     * button, so exactly one edge leaves it and the assertion is now about
     * which one.
     *
     * <p>The distinction it keeps guarding is the one that matters. A taken-down
     * event can go back on sale because nothing about it was destroyed; a
     * rejected one still cannot be revived at all, because it never had a
     * published version to return to.
     */
    @ParameterizedTest
    @EnumSource(EventTransition.class)
    void takenDownCanOnlyBeRestored(EventTransition transition) {
        assertThat(stateMachine.canTransition(TAKEN_DOWN, transition))
                .as("TAKEN_DOWN --%s-->", transition)
                .isEqualTo(transition == RESTORE);
    }

    @Test
    void restoringPutsItBackOnSale() {
        assertThat(stateMachine.requireTransition(TAKEN_DOWN, RESTORE)).isEqualTo(PUBLISHED);
    }

    @Test
    void nothingButATakenDownEventCanBeRestored() {
        // RESTORE is the undo for TAKE_DOWN and nothing else. In particular it
        // is not a second route from DRAFT to PUBLISHED that skips review.
        for (EventStatus from : EventStatus.values()) {
            if (from == TAKEN_DOWN) continue;
            assertThat(stateMachine.canTransition(from, RESTORE))
                    .as("%s --RESTORE-->", from)
                    .isFalse();
        }
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
    void theTableIsExactlyTheseTenEdges() {
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
                new Edge(PUBLISHED, TAKE_DOWN),
                new Edge(TAKEN_DOWN, RESTORE));

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
            // REJECTED alone now. TAKEN_DOWN has an exit - see
            // takenDownCanOnlyBeRestored.
            if (from == REJECTED) continue;
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
    void aRejectedOrTakenDownEventIsNotTheOrganisersToEdit() {
        assertThat(stateMachine.isEditable(REJECTED)).isFalse();
        // Still false now that TAKEN_DOWN can be restored, and deliberately so:
        // isEditable answers "may the ORGANISER change this", and an event an
        // admin pulled is not theirs to quietly rewrite before it goes back up.
        // The admin's own edit path does not consult this method at all - see
        // EventServiceimpl.updateEventAsAdmin.
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

    // ------------------------------------------------------- who owns a verb

    /**
     * The two audiences are no longer complements.
     *
     * <p>isOrganizerAction used to be {@code !isAdminAction()}, which made every
     * transition belong to exactly one side. TAKE_DOWN belongs to both now - an
     * admin pulls any event as moderation, an organiser pulls their own while
     * nothing has sold - so the pair has to be checked rather than assumed.
     */
    @Test
    void takeDownBelongsToBothAudiences() {
        assertThat(TAKE_DOWN.isAdminAction()).isTrue();
        assertThat(TAKE_DOWN.isOrganizerAction()).isTrue();
    }

    /**
     * RESTORE is the one that must NOT be shared.
     *
     * <p>It is the undo for a take-down and carries no record of who made that
     * decision, so an organiser holding it could reverse an admin's moderation -
     * the take-down would last exactly as long as it took them to notice.
     */
    @Test
    void restoreIsAdminOnly() {
        assertThat(RESTORE.isAdminAction()).isTrue();
        assertThat(RESTORE.isOrganizerAction()).isFalse();
    }

    @Test
    void everyTransitionBelongsToSomebody() {
        // A verb nobody may perform is dead weight in the table, and the most
        // likely way to get one is adding a transition and forgetting both lists
        // now that they are written out separately.
        for (EventTransition t : EventTransition.values()) {
            assertThat(t.isAdminAction() || t.isOrganizerAction())
                    .as("%s belongs to no audience", t)
                    .isTrue();
        }
    }

    @Test
    void theReviewDecisionsStayAdminOnly() {
        for (EventTransition t : List.of(APPROVE, REJECT, REQUEST_CHANGES)) {
            assertThat(t.isOrganizerAction()).as("%s", t).isFalse();
        }
    }

    @Test
    void theOrganisersOwnVerbsStayTheirs() {
        for (EventTransition t : List.of(SUBMIT, WITHDRAW, PUBLISH)) {
            assertThat(t.isAdminAction()).as("%s", t).isFalse();
        }
    }

    @Test
    void rejectedOffersNoActions() {
        assertThat(stateMachine.availableTransitions(REJECTED)).isEmpty();
    }

    @Test
    void takenDownOffersTheWayBack() {
        // What the moderation table renders as "Open again".
        assertThat(stateMachine.availableTransitions(TAKEN_DOWN)).containsExactly(RESTORE);
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
