package com.eventbooking.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    // 404 Not Found
    VENUE_NOT_FOUND(HttpStatus.NOT_FOUND),
    EVENT_NOT_FOUND(HttpStatus.NOT_FOUND),
    SEAT_CLASS_NOT_FOUND(HttpStatus.NOT_FOUND),
    ZONE_NOT_FOUND(HttpStatus.NOT_FOUND),
    SEAT_NOT_FOUND(HttpStatus.NOT_FOUND),
    HOLD_NOT_FOUND(HttpStatus.NOT_FOUND),
    BOOKING_NOT_FOUND(HttpStatus.NOT_FOUND),

    // 400 Bad Request
    INVALID_EVENT_SCHEDULE(HttpStatus.BAD_REQUEST),
    INVALID_SALES_WINDOW(HttpStatus.BAD_REQUEST),
    INVALID_HOLD_TARGET(HttpStatus.BAD_REQUEST),
    CROSS_EVENT_REFERENCE(HttpStatus.BAD_REQUEST),
    INVALID_ZONE_CAPACITY(HttpStatus.BAD_REQUEST),
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST),

    // 409 Conflict
    INVALID_EVENT_STATUS_TRANSITION(HttpStatus.CONFLICT),
    NO_INVENTORY(HttpStatus.CONFLICT),
    INVENTORY_MODE_MISMATCH(HttpStatus.CONFLICT),
    INVENTORY_MODE_CHANGE_BLOCKED(HttpStatus.CONFLICT),
    SEAT_UNAVAILABLE(HttpStatus.CONFLICT),
    INSUFFICIENT_ZONE_CAPACITY(HttpStatus.CONFLICT),
    HOLD_NOT_ACTIVE(HttpStatus.CONFLICT),
    INVALID_BOOKING_STATE_TRANSITION(HttpStatus.CONFLICT),
    EMPTY_HOLD(HttpStatus.CONFLICT),
    DUPLICATE_SEAT_CLASS_NAME(HttpStatus.CONFLICT),
    DUPLICATE_SEAT_CLASS_ORDER(HttpStatus.CONFLICT),
    DUPLICATE_ZONE_NAME(HttpStatus.CONFLICT),
    DUPLICATE_SEAT_LOCATION(HttpStatus.CONFLICT),

    // 410 Gone
    HOLD_EXPIRED(HttpStatus.GONE),

    // 503 Service Unavailable
    INVENTORY_CONTENTION(HttpStatus.SERVICE_UNAVAILABLE),

    // 500 Internal Server Error
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
