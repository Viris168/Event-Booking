import client from './client.js'

export const getSeatMap = (eventId) =>
  client.get(`/v1/event/${eventId}/seat-map`).then((r) => r.data)

export const getZoneAvailability = (eventId) =>
  client.get(`/v1/event/${eventId}/availability`).then((r) => r.data)

export const getSeatAvailability = (eventId) =>
  client.get(`/v1/events/${eventId}/seats/availability`).then((r) => r.data)
