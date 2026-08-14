package com.eventbooking.booking.error;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

import java.util.Map;

/**
 * Thrown by BookingStateMachine when a caller asks for an edge that is not
 * on the transition table. The offending states travel in `details` so the
 * client (and the logs) can see exactly which edge was refused.
 */
public class IllegalBookingTransitionException extends ApiException {

    public IllegalBookingTransitionException(BookingStatus from, BookingStatus to) {
        super(
                ErrorCode.INVALID_BOOKING_STATE_TRANSITION,
                "Booking cannot move from " + from + " to " + to + ".",
                false,
                Map.of("from", from.name(), "to", to.name())
        );
    }
}
