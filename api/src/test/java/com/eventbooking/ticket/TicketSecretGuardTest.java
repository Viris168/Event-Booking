package com.eventbooking.ticket;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The guard exists to stop one specific deploy: the one that ships with the
 * repository's own signing key. A fail-closed check nobody exercises is a check
 * that quietly stops working.
 */
class TicketSecretGuardTest {

    @Test
    void refusesToStartOnTheShippedPlaceholder() {
        TicketProperties placeholder =
                new TicketProperties(TicketProperties.PLACEHOLDER_SECRET, 256, 4);

        assertThatThrownBy(() -> new TicketSecretGuard(placeholder))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("TICKET_SIGNING_SECRET");
    }

    @Test
    void startsOnARealSecret() {
        TicketProperties real =
                new TicketProperties("a-real-secret-that-is-at-least-32-characters", 256, 4);

        assertThatCode(() -> new TicketSecretGuard(real)).doesNotThrowAnyException();
    }
}
