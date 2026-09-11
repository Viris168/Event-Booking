import client from './client.js'

/**
 * Platform-admin calls. Separate from events.js because the audience is
 * different: everything here is refused unless the caller resolves to a
 * PLATFORM_ADMIN, and all of it hangs off /admin rather than /event.
 *
 * Keeping them apart also means the moderation screens import a module that
 * cannot accidentally offer an organiser action, and vice versa.
 */

/**
 * The review queue: events in one status, oldest submission first.
 *
 * Deliberately NOT getEvents({ status }). That endpoint is the public
 * catalogue and returns only PUBLISHED and TAKEN_DOWN - a draft must never be
 * listable by an anonymous caller. This one is admin-only on the server.
 *
 * @param {{ status?: string, page?: number, size?: number }} params
 *        status defaults to PENDING_REVIEW server-side.
 */
export const getReviewQueue = (params) =>
  client.get('/admin/events', { params }).then((r) => r.data)

// --- decisions --------------------------------------------------------------
// One function per transition, mirroring events.js. approve and takedown carry
// no body; reject and request-changes require a message, because the organiser
// has to be told what to fix - the server rejects a blank one.

export const approveEvent = (id) =>
  client.patch(`/admin/events/${id}/approve`).then((r) => r.data)

export const rejectEvent = (id, message) =>
  client.patch(`/admin/events/${id}/reject`, { message }).then((r) => r.data)

export const requestEventChanges = (id, message) =>
  client.patch(`/admin/events/${id}/request-changes`, { message }).then((r) => r.data)

export const takeDownEvent = (id) =>
  client.patch(`/admin/events/${id}/takedown`).then((r) => r.data)
