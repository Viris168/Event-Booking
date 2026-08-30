import client from './client.js'

export const getSeatMap = (eventId) =>
  client.get(`/event/${eventId}/seat-map`).then((r) => r.data)

export const getZoneAvailability = (eventId) =>
  client.get(`/event/${eventId}/availability`).then((r) => r.data)

export const getSeatAvailability = (eventId) =>
  client.get(`/events/${eventId}/seats/availability`).then((r) => r.data)
