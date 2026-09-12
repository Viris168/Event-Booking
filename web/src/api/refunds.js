import client from './client.js'

/**
 * The admin refund queue: bookings sitting at REFUND_REQUESTED, longest-waiting
 * first. Server-scoped to platform admins — a non-admin gets 403 rather than an
 * empty list, so an empty array here means the queue really is empty.
 */
export const getRefundQueue = (params) =>
  client.get('/admin/refunds', { params }).then((r) => r.data)

/**
 * Grant a refund. Moves the booking to REFUNDED and puts its seats back on
 * sale.
 *
 * This records the decision; it does not move money. There is no refund call to
 * Bakong or PayWay behind it, so the transfer still has to be made out of band.
 */
export const approveRefund = (bookingId, reason) =>
  client.post(`/admin/refunds/${bookingId}/approve`, { reason }).then((r) => r.data)

/** Decline a refund, returning the booking to CONFIRMED with its tickets intact. */
export const rejectRefund = (bookingId, reason) =>
  client.post(`/admin/refunds/${bookingId}/reject`, { reason }).then((r) => r.data)
