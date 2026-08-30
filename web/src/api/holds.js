import client from './client.js'

function headersWithUser(userId) {
  return userId ? { headers: { 'X-User-Id': userId } } : {}
}

export const createHold = (eventId, { seat_ids, zone_qty }, userId) =>
  client
    .post(`/events/${eventId}/holds`, { seat_ids, zone_qty }, headersWithUser(userId))
    .then((r) => r.data)

export const getHold = (eventId, holdId, userId) =>
  client
    .get(`/events/${eventId}/holds/${holdId}`, headersWithUser(userId))
    .then((r) => r.data)

export const getMyActiveHold = (userId) =>
  client
    .get(`/holds/my-active-hold`, headersWithUser(userId))
    .then((r) => r.data)

export const releaseHold = (eventId, holdId, userId) =>
  client
    .delete(`/events/${eventId}/holds/${holdId}`, headersWithUser(userId))
    .then((r) => r.data)
