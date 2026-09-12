// How each notification type looks. The wording lives in i18n.js; this is only
// the glyph and the colour, kept beside each other so adding a type is one
// edit here and one there rather than a hunt through two components.
//
// Tones are the semantic status colours the rest of the app already uses, so a
// failed payment in the inbox is the same red as a failed payment on a booking
// row. 'quiet' is for the outcomes that are neither good nor bad - an expired
// hold is not a problem, it is just over.

export const NOTIFICATION_ICON = {
  BOOKING_CONFIRMED: 'checkCircle',
  BOOKING_PAYMENT_FAILED: 'alert',
  BOOKING_CANCELLED: 'xCircle',
  BOOKING_EXPIRED: 'clock',
  BOOKING_REFUNDED: 'wallet',
  BOOKING_REFUND_DECLINED: 'ticket',
  ORGANIZER_APPLICATION_APPROVED: 'building',
  ORGANIZER_APPLICATION_REJECTED: 'xCircle',

  EVENT_APPROVED: 'checkCircle',
  EVENT_REJECTED: 'xCircle',
  EVENT_CHANGES_REQUESTED: 'edit',
  EVENT_TAKEN_DOWN: 'alert',
  EVENT_TICKETS_SOLD: 'ticket',

  EVENT_SUBMITTED_FOR_REVIEW: 'eye',
  ORGANIZER_APPLICATION_SUBMITTED: 'building',
  REFUND_REQUESTED: 'wallet',
}

export const NOTIFICATION_TONE = {
  BOOKING_CONFIRMED: 'ok',
  BOOKING_PAYMENT_FAILED: 'bad',
  BOOKING_CANCELLED: 'quiet',
  BOOKING_EXPIRED: 'quiet',
  BOOKING_REFUNDED: 'ok',
  // Not 'bad': the request was refused, but the tickets are still good. Red
  // here would read as "something is wrong with your booking".
  BOOKING_REFUND_DECLINED: 'warn',
  ORGANIZER_APPLICATION_APPROVED: 'ok',
  ORGANIZER_APPLICATION_REJECTED: 'bad',

  EVENT_APPROVED: 'ok',
  EVENT_REJECTED: 'bad',
  EVENT_CHANGES_REQUESTED: 'warn',
  EVENT_TAKEN_DOWN: 'bad',
  EVENT_TICKETS_SOLD: 'ok',

  EVENT_SUBMITTED_FOR_REVIEW: 'info',
  ORGANIZER_APPLICATION_SUBMITTED: 'info',
  REFUND_REQUESTED: 'warn',
}

/** Unknown types still render: a new server type should not leave a blank row. */
export const notificationIcon = (type) => NOTIFICATION_ICON[type] || 'info'
export const notificationTone = (type) => NOTIFICATION_TONE[type] || 'quiet'
