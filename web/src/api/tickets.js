import client from './client.js'

/**
 * Tickets are issued by the server when a booking reaches CONFIRMED — there is
 * no endpoint that creates one, so this module only reads.
 *
 * A booking that has not been paid answers with an empty list rather than an
 * error, which is why the pay screen can poll this without special-casing.
 */
export const getBookingTickets = (bookingId) =>
  client.get(`/bookings/${bookingId}/tickets`).then((r) => r.data)

export const getTicket = (ticketId) => client.get(`/tickets/${ticketId}`).then((r) => r.data)

/**
 * The ticket's QR as SVG markup, ready to inline.
 *
 * Fetched rather than pointed at with an `<img src>`: the endpoint is owner-only
 * and reads `X-User-Id`, and an `<img>` cannot send a header. Going through the
 * axios client is also what will carry the JWT once auth lands, with no change
 * here.
 */
export const getTicketQrSvg = (ticketId, size) =>
  client
    .get(`/tickets/${ticketId}/qr.svg`, {
      params: size ? { size } : undefined,
      responseType: 'text',
      headers: { Accept: 'image/svg+xml' },
    })
    .then((r) => r.data)

/**
 * Scan one code at the gate.
 *
 * `eventId` is required by the server, not just recommended: a scan that named
 * no event used to admit every event's tickets, and that is now a 400. The
 * caller must also be the organiser of that event — a 403 here is about the
 * operator, never about the ticket.
 *
 * Resolves for a *refused* ticket too. The endpoint answers 200 with an
 * `outcome` for every verdict, because "no, used at 19:42" is a successful
 * answer to "is this good?". Only a bad request or a bad operator rejects.
 */
export const scanTicket = (payload, eventId) =>
  client.post('/tickets/scan', { payload, event_id: eventId }).then((r) => r.data)

/**
 * Look up a whole booking from any one of its codes. Admits nobody.
 *
 * Safe to call twice, or to call and walk away from — the server takes no lock
 * and consumes nothing. This is the screen a steward reads before deciding how
 * many of the party are actually standing there.
 */
export const previewGroup = (payload, eventId) =>
  client
    .post('/tickets/scan/group/preview', { payload, event_id: eventId })
    .then((r) => r.data)

/**
 * Admit named members of a booking.
 *
 * Takes ticket ids, never a count. A count is only safe where every ticket is
 * interchangeable — true of a zone line, false of assigned seats. On a mixed
 * booking "admit 3" burned whichever three came first in seat order, and the
 * person actually holding that seat was refused an hour later.
 *
 * Any id that is not on the scanned booking, or is already used, refuses the
 * whole call with `TICKET_NOT_IN_PARTY`. Re-preview and let the steward pick
 * again rather than retrying blind.
 */
export const confirmGroup = (payload, eventId, ticketIds) =>
  client
    .post('/tickets/scan/group/confirm', { payload, event_id: eventId, ticket_ids: ticketIds })
    .then((r) => r.data)

/**
 * Admission progress for one event: issued, admitted, still to come, refused.
 *
 * Scoped to the organiser of the event by the server, so there is no id to
 * pass beyond the event's own.
 */
export const getCheckInStats = (eventId) =>
  client.get(`/events/${eventId}/check-in-stats`).then((r) => r.data)
