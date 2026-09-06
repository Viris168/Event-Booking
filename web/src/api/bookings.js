import client from './client.js'

export const createBooking = (data) => client.post('/bookings', data).then((r) => r.data)
export const getMyBookings = () => client.get('/bookings/me').then((r) => r.data)
export const getBooking = (id) => client.get(`/bookings/${id}`).then((r) => r.data)
export const cancelBooking = (id) => client.post(`/bookings/${id}/cancel`).then((r) => r.data)

/**
 * The organiser's own transactions - every booking across the events they own.
 *
 * No organizerId parameter by design: the server scopes this to the caller, so
 * asking for another organiser's customers is unrepresentable rather than
 * merely refused. Returns a Spring Page, so the caller reads `.content` and
 * `.total_elements`.
 */
export const getOrganizerTransactions = (params) =>
  client.get('/organizer/transaction', { params }).then((r) => r.data)

/**
 * Confirmed revenue per month, aggregated server-side.
 *
 * Replaces fetching a page of raw bookings to sum them in the browser - that
 * was 500 rows for twelve numbers, and silently under-reported once an
 * organiser passed the page size.
 */
export const getMonthlyRevenue = (months = 12) =>
  client.get('/organizer/transaction/monthly', { params: { months } }).then((r) => r.data)
