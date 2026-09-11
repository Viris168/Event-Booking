import client from './client.js'

export const getSeatMap = (eventId) =>
  client.get(`/events/${eventId}/seat-map`).then((r) => r.data)

export const getZoneAvailability = (eventId) =>
  client.get(`/events/${eventId}/availability`).then((r) => r.data)

export const getSeatAvailability = (eventId) =>
  client.get(`/events/${eventId}/seats/availability`).then((r) => r.data)
