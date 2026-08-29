import client from './client.js'

export async function startPayment(bookingId, provider = 'ABA_PAYWAY') {
  const { data } = await client.post(`/bookings/${bookingId}/payments`, {
    provider
  })
  return data
}

export async function pollPayment(paymentId) {
  const { data } = await client.get(`/payments/${paymentId}`)
  return data
}

export async function getBookingPayments(bookingId) {
  const { data } = await client.get(`/bookings/${bookingId}/payments`)
  return data
}

/**
 * Stands in for ABA approving the transaction
 */
export async function simulateAbaPayment(tranId) {
  const { data } = await client.post(`/dev/payway/${encodeURIComponent(tranId)}/pay`)
  return data
}

/**
 * Stands in for Bakong KHQR being paid
 */
export async function simulateBakongPayment(paymentId) {
  const { data } = await client.post(`/dev/payments/${paymentId}/pay`)
  return data
}
