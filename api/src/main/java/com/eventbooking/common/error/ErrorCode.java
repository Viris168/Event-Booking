package com.eventbooking.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    // 404 Not Found
    VENUE_NOT_FOUND(HttpStatus.NOT_FOUND),
    VENUE_SEAT_NOT_FOUND(HttpStatus.NOT_FOUND),
    EVENT_NOT_FOUND(HttpStatus.NOT_FOUND),
    EVENT_IMAGE_NOT_FOUND(HttpStatus.NOT_FOUND),
    SEAT_CLASS_NOT_FOUND(HttpStatus.NOT_FOUND),
    ZONE_NOT_FOUND(HttpStatus.NOT_FOUND),
    SEAT_NOT_FOUND(HttpStatus.NOT_FOUND),
    HOLD_NOT_FOUND(HttpStatus.NOT_FOUND),
    BOOKING_NOT_FOUND(HttpStatus.NOT_FOUND),
    PAYMENT_NOT_FOUND(HttpStatus.NOT_FOUND),
    TICKET_NOT_FOUND(HttpStatus.NOT_FOUND),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND),

    // 400 Bad Request
    INVALID_EVENT_SCHEDULE(HttpStatus.BAD_REQUEST),
    INVALID_SALES_WINDOW(HttpStatus.BAD_REQUEST),
    INVALID_HOLD_TARGET(HttpStatus.BAD_REQUEST),
    CROSS_EVENT_REFERENCE(HttpStatus.BAD_REQUEST),
    INVALID_ZONE_CAPACITY(HttpStatus.BAD_REQUEST),
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST),
    UNKNOWN_OPERATOR(HttpStatus.BAD_REQUEST),
    INVALID_ADMIT_COUNT(HttpStatus.BAD_REQUEST),
    EMPTY_UPLOAD(HttpStatus.BAD_REQUEST),

    // 401 Unauthorized
    /* One code for every way a login can fail. Splitting it into "no such user"
       and "wrong password" would turn the endpoint into a way to discover which
       phone numbers are registered. */
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED),
    /* Likewise one code whether the refresh token is unknown, already revoked
       or expired: the client's next move is the same in all three cases. */
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED),
    ACCOUNT_DISABLED(HttpStatus.UNAUTHORIZED),
    /* No usable token on a request that needs one - missing, expired, forged,
       or issued for a user who has since been deleted. The filter collapses all
       four into "no authentication", and so does this. */
    NOT_AUTHENTICATED(HttpStatus.UNAUTHORIZED),

    // 403 Forbidden
    NOT_AN_ORGANIZER(HttpStatus.FORBIDDEN),
    NOT_AN_ADMIN(HttpStatus.FORBIDDEN),
    NOT_RESOURCE_OWNER(HttpStatus.FORBIDDEN),

    // 409 Conflict
    PHONE_ALREADY_REGISTERED(HttpStatus.CONFLICT),
    EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT),
    INVALID_EVENT_STATUS_TRANSITION(HttpStatus.CONFLICT),
    EVENT_NOT_EDITABLE(HttpStatus.CONFLICT),
    EVENT_NOT_ON_SALE(HttpStatus.CONFLICT),
    VENUE_DISABLED(HttpStatus.CONFLICT),
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
    BOOKING_NOT_PAYABLE(HttpStatus.CONFLICT),
    TICKET_NOT_CHECKED_IN(HttpStatus.CONFLICT),
    PAYMENT_ALREADY_SETTLED(HttpStatus.CONFLICT),

    // 410 Gone
    HOLD_EXPIRED(HttpStatus.GONE),

    // 413 Payload Too Large
    FILE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE),

    // 415 Unsupported Media Type
    UNSUPPORTED_FILE_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE),

    // 501 Not Implemented
    // The request is valid and the value is a real one; this build just has no
    // adapter for it yet (ABA PayWay).
    PAYMENT_PROVIDER_UNSUPPORTED(HttpStatus.NOT_IMPLEMENTED),

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
