import client from './client.js'

export async function createQr(payload) {
  const { data } = await client.post('/payment/create-qr', payload)
  return data
}

export async function checkStatus(tranId) {
  const { data } = await client.get(`/payment/check-status/${encodeURIComponent(tranId)}`)
  return data
}
