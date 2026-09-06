import client from './client.js'

export const getEvents = (params) => client.get('/event', { params }).then((r) => r.data)
export const getEvent = (id) => client.get(`/event/${id}`).then((r) => r.data)
export const createEvent = (data) => client.post('/event', data).then((r) => r.data)
export const updateEvent = (id, data) => client.patch(`/event/${id}`, data).then((r) => r.data)
export const publishEvent = (id) => client.patch(`/event/${id}/publish`).then((r) => r.data)

/**
 * The organiser's own events, every status included.
 *
 * Deliberately not getEvents(): that one is the public catalogue and now
 * returns only PUBLISHED and TAKEN_DOWN, so an organiser's drafts are invisible
 * to it by design. This endpoint is the other side of that rule.
 *
 * No organizerId parameter — the server scopes it to the caller.
 */
export const getOrganizerEvents = (params) =>
  client.get('/organizer/event', { params }).then((r) => r.data)

// --- review lifecycle -------------------------------------------------------
// One function per legal transition rather than a generic post(action): the
// server's paths differ (admin actions sit under /admin), and a single helper
// would have to know that mapping anyway.

export const submitEventForReview = (id) =>
  client.patch(`/event/${id}/submit`).then((r) => r.data)

export const withdrawEventFromReview = (id) =>
  client.patch(`/event/${id}/withdraw`).then((r) => r.data)

export const getEventReviewHistory = (id) =>
  client.get(`/event/${id}/review`).then((r) => r.data)
