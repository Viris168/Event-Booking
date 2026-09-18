package com.eventbooking.exception;

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
    ORGANIZER_APPLICATION_NOT_FOUND(HttpStatus.NOT_FOUND),
    /* No payout with this id - or none the caller may see. The organiser-facing
       lookups scope by organizerId and report a miss as this rather than as
       403, because confirming that an id exists turns a sequential invoice
       number into an oracle for other organisers' revenue. */
    PAYOUT_REQUEST_NOT_FOUND(HttpStatus.NOT_FOUND),
    /* An admin screen named an app_user id that no longer exists. Distinct
       from NOT_AUTHENTICATED, which is about the caller: here the caller is a
       valid admin and it is the row they are acting ON that is gone - two
       admins working the users table at once is the ordinary way to reach it. */
    USER_NOT_FOUND(HttpStatus.NOT_FOUND),
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
    /* The Telegram handle on a profile edit is not one: something is left
       after the @ and t.me/ decoration is stripped, and it is not 5-32
       characters of [A-Za-z0-9_]. Its own code rather than VALIDATION_ERROR so
       the account panel can put the message under that field instead of
       failing the whole form - the display name and email in the same request
       are usually fine. */
    INVALID_TELEGRAM_USERNAME(HttpStatus.BAD_REQUEST),

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
    /* hold.extended is already true. The schema allows exactly one extension
       per hold, so this is a refusal rather than a no-op: silently returning
       success would let a client stretch a hold indefinitely by retrying. */
    HOLD_ALREADY_EXTENDED(HttpStatus.CONFLICT),
    INVALID_BOOKING_STATE_TRANSITION(HttpStatus.CONFLICT),
    EMPTY_HOLD(HttpStatus.CONFLICT),
    DUPLICATE_SEAT_CLASS_NAME(HttpStatus.CONFLICT),
    DUPLICATE_SEAT_CLASS_ORDER(HttpStatus.CONFLICT),
    DUPLICATE_ZONE_NAME(HttpStatus.CONFLICT),
    DUPLICATE_SEAT_LOCATION(HttpStatus.CONFLICT),

    /* A venue seat section was asked to be deleted while event_seat rows still
       point at it. Those rows are somebody's seat map - possibly with tickets
       behind them - and venue_seat has no ON DELETE behaviour that could make
       the removal safe. CONFLICT, not FORBIDDEN: the caller owns the venue and
       is allowed to ask; the events using it are what make the answer no. */
    VENUE_SEATS_IN_USE(HttpStatus.CONFLICT),
    BOOKING_NOT_PAYABLE(HttpStatus.CONFLICT),
    TICKET_NOT_CHECKED_IN(HttpStatus.CONFLICT),
    PAYMENT_ALREADY_SETTLED(HttpStatus.CONFLICT),
    /* The caller already has an organizer_profile row, which IS what being an
       organiser means - there is nothing for an application to grant them. */
    ALREADY_AN_ORGANIZER(HttpStatus.CONFLICT),

    /* The event has already been claimed - one payout per event, ever. Backed
       by uq_payout_request_event; checked in the service so it reads as a
       conflict rather than as a 23505. */
    PAYOUT_ALREADY_REQUESTED(HttpStatus.CONFLICT),

    /* Approve/reject arrived for a row that is not REQUESTED, or mark-paid for
       one that is not APPROVED. Two admins working the queue at once is the
       ordinary way there. */
    PAYOUT_ALREADY_DECIDED(HttpStatus.CONFLICT),

    /* A payout was asked for before the event happened. CONFLICT rather than
       BAD_REQUEST: nothing is malformed, and the identical call succeeds once
       the date passes. Distinct from EVENT_ALREADY_FINISHED below, which is
       the same clock read for the opposite purpose. */
    EVENT_NOT_FINISHED(HttpStatus.CONFLICT),

    /* The event finished owing nothing - it sold nothing, or everything it sold
       came back. Refused rather than issued as a $0.00 invoice that an admin
       still has to work through the queue. */
    NOTHING_TO_PAY_OUT(HttpStatus.CONFLICT),

    /* One open application per person. Checked in the service so the caller
       gets this instead of the raw violation from
       uq_organizer_application_pending. */
    ORGANIZER_APPLICATION_ALREADY_PENDING(HttpStatus.CONFLICT),
    /* Approve or reject on a row that is no longer PENDING. Two admins working
       the queue at once is the ordinary way to reach this. */
    ORGANIZER_APPLICATION_ALREADY_DECIDED(HttpStatus.CONFLICT),
    /* DELETE on an event that has sold something. Deleting it would take real
       customers' bookings and tickets with it, so the admin is pointed at
       take-down instead - which is the reversible action that exists for
       exactly this case. */
    EVENT_NOT_DELETABLE(HttpStatus.CONFLICT),
    /* An organiser tried to pull their own event after it had sold something.
       Taking a show off sale once people hold tickets to it is a money-back
       decision, which is the platform's to make - so past the first sale the
       action stays with an admin. */
    EVENT_HAS_SALES(HttpStatus.CONFLICT),
    /* An action that only makes sense on an event still ahead of everyone -
       today only RESTORE. Putting a finished show back on sale would set it
       PUBLISHED for a date that has passed: it still could not sell, because
       verifyEventIsOnSale checks the clock, and it would not reappear in the
       catalogue, which now lists from today onward. The status would be the
       only thing that changed, and it would be wrong. */
    EVENT_ALREADY_FINISHED(HttpStatus.CONFLICT),
    /* The admin users screen asked for a role change the platform cannot make:
       an admin editing their own role, or a promotion to organiser with no
       organisation name to put on the events. Not 403 - the caller has every
       permission, it is the change itself that is impossible. */
    ROLE_CHANGE_BLOCKED(HttpStatus.CONFLICT),
    /* An action that would leave the platform with no working administrator:
       disabling or demoting the last enabled PLATFORM_ADMIN, or an admin
       disabling themselves. There is no way back from zero through the API -
       enabling an account requires an admin - so the only remedy is SQL against
       the database, which is exactly what this refusal exists to avoid. */
    LAST_ADMIN(HttpStatus.CONFLICT),
    /* A fourth administrator. The cap is small on purpose: every admin sees all
       platform data and can act on any of it, so the list should stay short
       enough to read at a glance. */
    ADMIN_LIMIT_REACHED(HttpStatus.CONFLICT),

    // 410 Gone
    HOLD_EXPIRED(HttpStatus.GONE),

    // 413 Payload Too Large
    FILE_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE),

    // 429 Too Many Requests
    // Login attempts refused before the password is checked at all - see
    // LoginRateLimiter. Carries retry_after_seconds in `details`.
    TOO_MANY_LOGIN_ATTEMPTS(HttpStatus.TOO_MANY_REQUESTS),

    // Google sign-in: a token we could not verify, for any reason. 401 rather
    // than 400 - the caller presented a credential and it was not accepted.
    // Also raised when Google sign-in is switched off, so a missing client id
    // reads as "that did not work" rather than exposing which half is absent.
    INVALID_GOOGLE_TOKEN(HttpStatus.UNAUTHORIZED),

    // A Google account has no phone until its owner adds one, and this is the
    // refusal that says so. 409 because the request is coherent and the account
    // state is what makes it impossible, and because the client acts on it by
    // sending the user to the phone screen rather than by editing the payload.
    PHONE_NUMBER_REQUIRED(HttpStatus.CONFLICT),

    // Linking a Google identity to an existing account. The first two are one
    // answer to two questions - "you already linked one" and "that one belongs
    // to somebody else" - because distinguishing them would confirm whether a
    // stranger's Google account exists here.
    // A first password on an account that already has one. Its own code because
    // setting a first password requires no proof of the old one - there is none
    // - and the endpoint that replaces a password must always ask.
    PASSWORD_ALREADY_SET(HttpStatus.CONFLICT),

    GOOGLE_ALREADY_LINKED(HttpStatus.CONFLICT),
    GOOGLE_NOT_LINKED(HttpStatus.CONFLICT),

    // Unlinking the only way into an account. Refused, because the row would
    // still hold bookings its owner could no longer reach.
    LAST_SIGN_IN_METHOD(HttpStatus.CONFLICT),

    // 415 Unsupported Media Type
    UNSUPPORTED_FILE_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE),

    // 501 Not Implemented
    // The request is valid and the value is a real one; this build just has no
    // adapter for it yet (ABA PayWay).
    PAYMENT_PROVIDER_UNSUPPORTED(HttpStatus.NOT_IMPLEMENTED),

    // 502 Bad Gateway
    /* The vision provider was reached and the answer was not usable - a
       timeout, a refusal, or a reply that was not the JSON it was asked for.
       One code for all of them: the admin's next move is to type the reference
       themselves regardless of which it was. */
    RECEIPT_EXTRACTION_FAILED(HttpStatus.BAD_GATEWAY),

    // 503 Service Unavailable
    INVENTORY_CONTENTION(HttpStatus.SERVICE_UNAVAILABLE),

    /* No vision key on this deployment, which is a supported configuration
       rather than a fault. The transfer dialog hides its drop zone and the
       admin types, exactly as before the feature existed. */
    RECEIPT_EXTRACTION_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE),

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
