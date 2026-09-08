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

// --- seat classes ----------------------------------------------------------
// What a section costs at THIS event. The seats themselves belong to the venue;
// only the price is the event's business, which is why these hang off an event
// id and never a venue id.

export const getSeatClasses = (eventId) =>
  client.get(`/event/${eventId}/seat-class`).then((r) => r.data)

export const createSeatClass = (eventId, data) =>
  client.post(`/event/${eventId}/seat-class`, { ...data, event_id: Number(eventId) }).then((r) => r.data)

export const updateSeatClass = (eventId, seatClassId, data) =>
  client.patch(`/event/${eventId}/seat-class/${seatClassId}`, data).then((r) => r.data)

/** Assign venue seats to a class — this is what makes them sellable. */
export const assignEventSeats = (eventId, seatClassId, venueSeatIds) =>
  client
    .post(`/events/${eventId}/seats`, {
      seat_class_id: Number(seatClassId),
      venue_seat_ids: venueSeatIds,
    })
    .then((r) => r.data)

export const getEventSeatMap = (eventId) =>
  client.get(`/event/${eventId}/seat-map`).then((r) => r.data)

// --- zones -----------------------------------------------------------------

export const getEventZones = (eventId) =>
  client.get(`/event/${eventId}/zone`).then((r) => r.data)

export const createEventZone = (eventId, data) =>
  client.post(`/event/${eventId}/zone`, data).then((r) => r.data)

export const updateEventZone = (zoneId, data) =>
  client.patch(`/zone/${zoneId}`, data).then((r) => r.data)

export const deleteEventZone = (zoneId) => client.delete(`/zone/${zoneId}`).then((r) => r.data)

// --- images ----------------------------------------------------------------
// Two slots, COVER and BANNER, uploaded AFTER the event exists — a file needs
// multipart, and Cloudinary's returned id has to land on a row that is already
// there. The response is the whole event, so a caller that just uploaded does
// not need a second GET to render the result.

export const uploadEventImage = (eventId, file, role = 'COVER') => {
  const body = new FormData()
  body.append('file', file)
  return client
    .post(`/event/${eventId}/image`, body, {
      params: { role },
      // Explicitly unset: the shared client sets application/json, and axios
      // must be left to write its own multipart boundary.
      headers: { 'Content-Type': undefined },
    })
    .then((r) => r.data)
}

export const deleteEventImage = (eventId, role = 'COVER') =>
  client.delete(`/event/${eventId}/image`, { params: { role } }).then((r) => r.data)
