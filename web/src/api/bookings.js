import client from './client.js'

export const createBooking = (data) => client.post('/bookings', data).then((r) => r.data)
export const getMyBookings = () => client.get('/bookings/me').then((r) => r.data)
export const cancelBooking = (id) => client.post(`/bookings/${id}/cancel`).then((r) => r.data)
