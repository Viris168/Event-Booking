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

/**
 * Turns however a Cambodian types their number into the E.164 the API wants.
 *
 * Nobody here writes "+85512345678". They write 012 345 678 - that is what is
 * printed on a business card, said out loud, and saved in a contact list. The
 * database stores E.164 because that is unambiguous and is what PayWay and any
 * SMS provider expect, but that is a storage decision and there is no reason to
 * make a customer perform the conversion.
 *
 * Accepts all of these as the same number, spaces and dashes anywhere:
 *
 *   012 345 678        the way it is actually written
 *   012-345-678
 *   +855 12 345 678    already international
 *   85512345678        pasted without the plus
 *   +855 012 345 678   both forms at once, which people do type
 *   12345678           no trunk zero
 *
 * Returns the E.164 string, or null when it cannot be read as a Cambodian
 * number. Null rather than a best guess: a wrong number silently accepted is a
 * ticket nobody can be reached about.
 */
export function toE164(input) {
  const raw = (input || '').trim()
  let digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null

  /*
   * An explicit international prefix is a claim about which country this is,
   * and it has to be honoured. Without this check "+1 555 0100" loses its "+1",
   * gets read as a local number and is stored as +855 15550100 - a real
   * Cambodian number belonging to someone else entirely. Refusing is the only
   * safe answer; this product sells tickets in one country.
   */
  const isInternational = raw.startsWith('+') || digits.startsWith('00')
  if (isInternational && !digits.replace(/^00/, '').startsWith('855')) return null

  // Country code, however it arrived: 855... or 00855...
  if (digits.startsWith('00855')) digits = digits.slice(5)
  else if (digits.startsWith('855')) digits = digits.slice(3)

  // The trunk zero belongs to the national format and is dropped in E.164.
  // Checked AFTER the country code so "+855 012..." works too.
  if (digits.startsWith('0')) digits = digits.slice(1)

  // The schema's CHECK constraint, applied here so the caller never sends
  // something the database is going to refuse.
  if (!/^[0-9]{8,9}$/.test(digits)) return null
  return `+855${digits}`
}

export function seatLabel(seat) {
  return `${seat.section_label} · ${seat.row_label}${seat.seat_number}`
}
