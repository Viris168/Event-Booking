package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

public class EventNotOnSaleException extends ApiException {
    public EventNotOnSaleException(Long eventId) {
        super(ErrorCode.EVENT_NOT_ON_SALE, "Event is not currently on sale: " + eventId);
    }
}
