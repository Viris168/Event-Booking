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
