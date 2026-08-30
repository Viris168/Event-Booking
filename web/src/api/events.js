import client from './client.js'

export const getEvents = (params) => client.get('/event', { params }).then((r) => r.data)
export const getEvent = (id) => client.get(`/event/${id}`).then((r) => r.data)
export const createEvent = (data) => client.post('/event', data).then((r) => r.data)
export const updateEvent = (id, data) => client.patch(`/event/${id}`, data).then((r) => r.data)
export const publishEvent = (id) => client.patch(`/event/${id}/publish`).then((r) => r.data)
