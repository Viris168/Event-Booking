import client from './client.js'

export async function createQr(payload) {
  const { data } = await client.post('/payment/create-qr', payload)
  return data
}

export async function checkStatus(tranId) {
  const { data } = await client.get(`/payment/check-status/${encodeURIComponent(tranId)}`)
  return data
}

/**
 * Stands in for ABA approving the transaction, so the checkout's "simulate
 * success" button confirms the booking and issues real tickets instead of only
 * showing a green screen.
 *
 * Exists only while the API runs with PAYWAY_MODE=MOCK; in LIVE the endpoint is
 * not registered and this 404s, which is the intended behaviour — there must be
 * no build where a caller can declare a real booking paid.
 */
export async function simulatePayment(tranId) {
  const { data } = await client.post(`/dev/payway/${encodeURIComponent(tranId)}/pay`)
  return data
}
