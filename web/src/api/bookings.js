import client from './client.js'

export const createBooking = (data) => client.post('/bookings', data).then((r) => r.data)
export const getMyBookings = () => client.get('/bookings/me').then((r) => r.data)
export const getBooking = (id) => client.get(`/bookings/${id}`).then((r) => r.data)
/**
 * Cancel an unpaid booking. Returns the updated booking, so the caller can
 * render the new state rather than refetching to discover it.
 *
 * Only PENDING_PAYMENT, AWAITING_CONFIRMATION and PAYMENT_FAILED can be
 * cancelled — a paid booking answers 409 and has to go through requestRefund,
 * because a successful charge cannot be un-made.
 */
export const cancelBooking = (id, reason) =>
  client.post(`/bookings/${id}/cancel`, { reason }).then((r) => r.data)

/**
 * Ask for a refund on a CONFIRMED booking. Puts it in REFUND_REQUESTED for an
 * admin to decide; the tickets stay valid and the seats stay sold until that
 * decision, so nothing about the customer's tickets changes here.
 */
export const requestRefund = (id, reason) =>
  client.post(`/bookings/${id}/refund`, { reason }).then((r) => r.data)

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
