import client from './client.js'

export const getEvents = (params) => client.get('/v1/event', { params }).then((r) => r.data)
export const getEvent = (id) => client.get(`/v1/event/${id}`).then((r) => r.data)
export const createEvent = (data) => client.post('/v1/event', data).then((r) => r.data)
export const updateEvent = (id, data) => client.patch(`/v1/event/${id}`, data).then((r) => r.data)
export const publishEvent = (id) => client.patch(`/v1/event/${id}/publish`).then((r) => r.data)
