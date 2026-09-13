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
