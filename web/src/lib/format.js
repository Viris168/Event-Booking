// Display helpers. The API speaks cents; the UI never shows raw cents.

export const FX_RATE_KHR_PER_USD = 4100

export function usd(cents) {
  const n = (Number(cents) || 0) / 100
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** KHR is quoted to the nearest 100 riel, the way local pricing actually works. */
export function khr(amount) {
  const n = Math.round((Number(amount) || 0) / 100) * 100
  return `៛${n.toLocaleString('en-US')}`
}

export function khrFromUsdCents(cents, rate = FX_RATE_KHR_PER_USD) {
  return Math.round(((Number(cents) || 0) / 100) * rate)
}

/** "$12.00 · ៛49,200" — the dual-currency pair used everywhere. */
export function dualPrice(usdCents, rate = FX_RATE_KHR_PER_USD) {
  return `${usd(usdCents)} · ${khr(khrFromUsdCents(usdCents, rate))}`
}

export function formatDate(iso, locale = 'en') {
  const d = new Date(iso)
  return d.toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(iso, locale = 'en') {
  const d = new Date(iso)
  return d.toLocaleTimeString(locale === 'km' ? 'km-KH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateTime(iso, locale = 'en') {
  return `${formatDate(iso, locale)} · ${formatTime(iso, locale)}`
}

/** Compact relative age for admin/audit tables: "3m ago", "2d ago". */
export function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Countdown as m:ss, falling back to h:mm:ss over an hour. */
export function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Cambodian mobile format enforced by the schema: +855 then 8-9 digits. */
export const PHONE_RE = /^\+855[0-9]{8,9}$/

export function isValidPhone(v) {
  return PHONE_RE.test((v || '').trim())
}

export function seatLabel(seat) {
  return `${seat.section_label} · ${seat.row_label}${seat.seat_number}`
}
