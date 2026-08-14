package com.eventbooking.catalog.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

public class EventNotOnSaleException extends ApiException {
    public EventNotOnSaleException(Long eventId) {
        super(ErrorCode.EVENT_NOT_ON_SALE, "Event is not currently on sale: " + eventId);
    }
}
