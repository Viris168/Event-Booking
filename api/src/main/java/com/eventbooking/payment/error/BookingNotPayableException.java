package com.eventbooking.payment.error;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * The booking is in a state that cannot take money: already expired or
 * cancelled (its seats are back on sale), or somewhere on the refund path.
 */
public class BookingNotPayableException extends ApiException {
    public BookingNotPayableException(Long bookingId, BookingStatus state) {
        super(ErrorCode.BOOKING_NOT_PAYABLE,
                "Booking " + bookingId + " is " + state + " and cannot accept a payment.");
    }
}
