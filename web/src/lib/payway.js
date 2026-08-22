// The shape of an ABA PayWay eCommerce checkout, as far as the UI is concerned.
//
// Mirrors developer.payway.com.kh's flow: the merchant creates a transaction
// (POST /api/payment-gateway/v1/payments/purchase), PayWay answers with a
// checkout it renders as a popup / bottom sheet / hosted page, the buyer pays
// inside it, and the merchant then verifies with Check Transaction and receives
// the same result again on its return_url.
//
// Nothing here talks to PayWay — there is no merchant profile behind this
// prototype. It generates the fields the real gateway would (tran_id, req_time,
// hash, apv) and keeps one open transaction per booking in sessionStorage so a
// return to the return_url page finds the attempt it left.

/**
 * payment_option values this merchant accepts. PayWay also offers cards,
 * wechat, alipay and google_pay; this storefront takes ABA PAY only, so those
 * are left out of the purchase request rather than shown and refused.
 */
export const PAYMENT_OPTIONS = [
  {
    id: 'abapay_khqr',
    icon: 'qr',
    currency: 'USD',
    kind: 'qr',
    titleEn: 'ABA PAY / KHQR',
    titleKm: 'ABA PAY / KHQR',
    subEn: 'Scan with ABA Mobile or any KHQR bank app',
    subKm: 'ស្កេនដោយ ABA Mobile ឬកម្មវិធីធនាគារ KHQR ណាមួយ',
  },
  {
    id: 'abapay_khqr_deeplink',
    icon: 'phone',
    currency: 'USD',
    kind: 'deeplink',
    titleEn: 'ABA PAY — open the app',
    titleKm: 'ABA PAY — បើកកម្មវិធី',
    subEn: 'Hands off to ABA Mobile and returns here',
    subKm: 'បញ្ជូនទៅ ABA Mobile រួចត្រឡប់មកវិញ',
  },
]

export const DEFAULT_OPTION = 'abapay_khqr'

export function paymentOption(id) {
  return PAYMENT_OPTIONS.find((o) => o.id === id) || PAYMENT_OPTIONS[0]
}

export function optionTitle(id, locale) {
  const o = paymentOption(id)
  return locale === 'km' ? o.titleKm : o.titleEn
}

export function optionSub(id, locale) {
  const o = paymentOption(id)
  return locale === 'km' ? o.subKm : o.subEn
}

/**
 * The provider enum the booking API stores an attempt under. Every option here
 * settles through ABA, KHQR scans included — the QR is PayWay's, not Bakong's.
 */
export const PROVIDER = 'ABA_PAYWAY'

export const MERCHANT_ID = 'event_booking_kh'
export const MERCHANT_NAME = 'Event Booking Cambodia'

/** PayWay's req_time format: yyyyMMddHHmmss, UTC. */
export function reqTime(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  )
}

function rand(len, alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ') {
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/**
 * Stands in for the base64 HMAC-SHA512 `hash` the merchant server signs the
 * purchase request with. Deliberately not cryptographic: signing belongs on the
 * server, which is where it will live once the API is wired to PayWay.
 */
function fakeHash(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return btoa(`${seed}:${(h >>> 0).toString(16)}`).replace(/=+$/, '').slice(0, 44)
}

const key = (bookingId) => `payway_txn_${bookingId}`

/**
 * The purchase request/response pair, flattened. `status` follows PayWay's
 * payment_status wording (PENDING / APPROVED / DECLINED / CANCELLED / EXPIRED)
 * and `statusCode` its numeric twin — 0 approved, 2 pending, 3 declined.
 */
export function createTransaction({
  bookingId,
  bookingRef,
  option = DEFAULT_OPTION,
  viewType = 'popup',
  amountUsdCents = 0,
  lifetimeMinutes = 15,
  returnUrl = '',
}) {
  const now = Date.now()
  const opt = paymentOption(option)
  const tranId = `${bookingRef || 'EVB'}-${rand(4)}`
  const txn = {
    merchant_id: MERCHANT_ID,
    tran_id: tranId,
    req_time: reqTime(new Date(now)),
    booking_id: String(bookingId),
    payment_option: opt.id,
    view_type: viewType,
    currency: opt.currency,
    amount: amountUsdCents / 100,
    amount_usd_cents: amountUsdCents,
    hash: fakeHash(`${MERCHANT_ID}${tranId}${amountUsdCents}`),
    return_url: returnUrl,
    status: 'PENDING',
    status_code: 2,
    apv: null,
    lifetime: lifetimeMinutes,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + lifetimeMinutes * 60000).toISOString(),
    resolved_at: null,
  }
  saveTransaction(txn)
  return txn
}

export function saveTransaction(txn) {
  try {
    sessionStorage.setItem(key(txn.booking_id), JSON.stringify(txn))
  } catch {
    /* private mode — the attempt just will not survive a reload */
  }
  return txn
}

export function loadTransaction(bookingId) {
  try {
    const raw = sessionStorage.getItem(key(bookingId))
    if (!raw) return null
    const txn = JSON.parse(raw)
    // A transaction past its lifetime is dead whichever way it was left.
    if (txn.status === 'PENDING' && Date.parse(txn.expires_at) < Date.now()) {
      return settleTransaction(bookingId, 'EXPIRED')
    }
    return txn
  } catch {
    return null
  }
}

const CODES = { APPROVED: 0, PENDING: 2, DECLINED: 3, CANCELLED: 4, EXPIRED: 5 }

/** What the webhook / Check Transaction response would come back saying. */
export function settleTransaction(bookingId, status) {
  const txn = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(key(bookingId)) || 'null')
    } catch {
      return null
    }
  })()
  if (!txn) return null
  const next = {
    ...txn,
    status,
    status_code: CODES[status] ?? 3,
    apv: status === 'APPROVED' ? txn.apv || rand(6, '0123456789') : null,
    resolved_at: new Date().toISOString(),
  }
  return saveTransaction(next)
}

export function clearTransaction(bookingId) {
  try {
    sessionStorage.removeItem(key(bookingId))
  } catch {
    /* ignore */
  }
}

export const isOpen = (txn) => txn?.status === 'PENDING'
