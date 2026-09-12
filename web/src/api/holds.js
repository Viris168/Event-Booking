import client from './client.js'

/*
 * The userId these functions used to forward as an X-User-Id header is gone.
 * It stopped doing anything when CurrentUserIdArgumentResolver started reading
 * the id off the JWT principal instead: the server never looked at the header
 * again, so sending it only suggested that passing a different id would change
 * whose hold you touched. The callers still pass userId in some places and it
 * is simply ignored here, rather than removed from every call site at once.
 */

export const createHold = (eventId, { seat_ids, zone_qty }) =>
  client.post(`/events/${eventId}/holds`, { seat_ids, zone_qty }).then((r) => r.data)

export const getHold = (eventId, holdId) =>
  client.get(`/events/${eventId}/holds/${holdId}`).then((r) => r.data)

export const getMyActiveHold = () => client.get(`/holds/my-active-hold`).then((r) => r.data)

/**
 * The one-time extension. Returns the whole hold, so the countdown can be
 * redrawn from the server's new expires_at rather than a guess added locally —
 * the server decides how much time this buys (app.hold.extension-minutes), and
 * the clock on screen must never disagree with it.
 *
 * A second call answers 409 HOLD_ALREADY_EXTENDED; a hold whose clock ran out
 * first answers 410 HOLD_EXPIRED and its seats are already back on sale.
 */
export const extendHold = (eventId, holdId) =>
  client.post(`/events/${eventId}/holds/${holdId}/extend`).then((r) => r.data)

export const releaseHold = (eventId, holdId) =>
  client.delete(`/events/${eventId}/holds/${holdId}`).then((r) => r.data)
