// In-memory mock backend. Every function here is a stand-in for one API call,
// including the guarantees the real backend enforces in the database:
//   * a seat can only be held/sold once (no oversell)
//   * one ACTIVE hold per user per event
//   * holds expire and release their inventory
//   * one SUCCESS payment per booking
// No network calls are made anywhere in this file.

import { useEffect, useState } from 'react'
import { buildSeed, HOLD_TTL_MS, HOLD_EXTENSION_MS, PROVINCES } from './seed.js'
import { FX_RATE_KHR_PER_USD, khrFromUsdCents } from '../lib/format.js'

const db = buildSeed()
const listeners = new Set()

// Notifications are deferred to a microtask: selectors sweep expired holds
// while components render, and a synchronous notify would set state mid-render.
let emitQueued = false
function emit() {
  if (emitQueued) return
  emitQueued = true
  queueMicrotask(() => {
    emitQueued = false
    for (const fn of listeners) fn()
  })
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Re-renders the calling component whenever the mock data changes, and once a
 * second so hold countdowns stay live.
 */
export function useStore() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const unsub = subscribe(bump)
    const timer = setInterval(() => {
      if (sweepExpired()) return // sweepExpired emits its own change
      bump()
    }, 1000)
    return () => {
      unsub()
      clearInterval(timer)
    }
  }, [])
  return db
}

// ---------------------------------------------------------------- expiry
/** Releases inventory for holds past expires_at. Returns true if anything changed. */
export function sweepExpired() {
  const nowMs = Date.now()
  let changed = false

  for (const hold of db.holds) {
    if (hold.status !== 'ACTIVE') continue
    if (new Date(hold.expires_at).getTime() > nowMs) continue

    hold.status = 'EXPIRED'
    changed = true

    for (const seat of db.eventSeats) {
      if (seat.hold_id === hold.id && seat.status === 'HELD') {
        seat.status = 'AVAILABLE'
        seat.hold_id = null
        seat.hold_expires_at = null
      }
    }
    for (const line of holdZoneLines(hold.id)) {
      const zone = db.eventZones.find((z) => z.id === line.event_zone_id)
      if (zone) zone.held_qty = Math.max(0, zone.held_qty - line.qty)
    }

    // A booking still waiting on payment dies with its hold.
    const booking = db.bookings.find((b) => b.hold_id === hold.id)
    if (booking && ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION'].includes(booking.state)) {
      transition(booking, 'EXPIRED', null, 'Hold expired before payment')
      for (const p of paymentsForBooking(booking.id)) {
        if (['CREATED', 'PENDING'].includes(p.status)) {
          p.status = 'EXPIRED'
          p.resolved_at = new Date().toISOString()
        }
      }
    }
  }

  // Anonymous "held by another shopper" seats also age out.
  for (const seat of db.eventSeats) {
    if (seat.status === 'HELD' && seat.hold_id === -1 && seat.hold_expires_at) {
      if (new Date(seat.hold_expires_at).getTime() <= nowMs) {
        seat.status = 'AVAILABLE'
        seat.hold_id = null
        seat.hold_expires_at = null
        changed = true
      }
    }
  }

  if (changed) emit()
  return changed
}

// hold_zone_line rows, keyed by hold.
const holdZoneLinesByHold = new Map()
function holdZoneLines(holdId) {
  return holdZoneLinesByHold.get(holdId) || []
}
function setHoldZoneLines(holdId, lines) {
  holdZoneLinesByHold.set(holdId, lines)
}

// Rebuild the zone lines of seeded ACTIVE holds from their booking items, so an
// expiring seeded hold gives its GA capacity back like a freshly created one.
for (const hold of db.holds) {
  if (hold.status !== 'ACTIVE') continue
  const booking = db.bookings.find((b) => b.hold_id === hold.id)
  if (!booking) continue
  const lines = db.bookingItems
    .filter((i) => i.booking_id === booking.id && i.event_zone_id)
    .map((i) => ({
      id: `${hold.id}-${i.event_zone_id}`,
      hold_id: hold.id,
      event_zone_id: i.event_zone_id,
      qty: i.qty,
    }))
  if (lines.length) setHoldZoneLines(hold.id, lines)
}

function transition(booking, toState, byUserId, note) {
  const from = booking.state
  booking.state = toState
  booking.state_changed_at = new Date().toISOString()
  db.bookingHistory.push({
    id: db.counters.nextHistoryId(),
    booking_id: booking.id,
    from_state: from,
    to_state: toState,
    changed_by_user_id: byUserId ?? null,
    note: note || null,
    changed_at: booking.state_changed_at,
  })
}

// ------------------------------------------------------------------ auth
export function findUserByLogin(identifier) {
  const id = (identifier || '').trim().toLowerCase()
  return db.users.find(
    (u) => u.phone_e164.toLowerCase() === id || (u.email || '').toLowerCase() === id,
  )
}

export function authenticate(identifier, password) {
  const user = findUserByLogin(identifier)
  if (!user) return { error: 'NO_SUCH_USER' }
  if (user.password !== password) return { error: 'BAD_CREDENTIALS' }
  if (user.is_disabled) return { error: 'ACCOUNT_DISABLED' }
  return { user }
}

export function registerUser({ display_name, phone_e164, email, password, locale }) {
  if (db.users.some((u) => u.phone_e164 === phone_e164)) return { error: 'PHONE_TAKEN' }
  if (email && db.users.some((u) => u.email === email)) return { error: 'EMAIL_TAKEN' }
  const user = {
    id: db.counters.nextUserId(),
    phone_e164,
    email: email || null,
    display_name,
    locale: locale || 'km',
    role: 'CUSTOMER',
    is_disabled: false,
    created_at: new Date().toISOString(),
    password,
  }
  db.users.push(user)
  emit()
  return { user }
}

export function getUserById(id) {
  return db.users.find((u) => u.id === Number(id)) || null
}

export function getOrganizerProfileForUser(userId) {
  return db.organizerProfiles.find((p) => p.user_id === Number(userId)) || null
}

// ---------------------------------------------------------------- lookups
export { PROVINCES }

export function provinceName(code, locale = 'en') {
  const p = PROVINCES.find((x) => x.code === code)
  if (!p) return code
  return locale === 'km' ? p.name_km : p.name_en
}

export function getVenue(id) {
  return db.venues.find((v) => v.id === Number(id)) || null
}

export function listVenues(organizerId) {
  return db.venues.filter((v) => !organizerId || v.organizer_id === Number(organizerId))
}

export function venueSeatsOf(venueId) {
  return db.venueSeats.filter((s) => s.venue_id === Number(venueId))
}

export function seatCountOf(venueId) {
  return venueSeatsOf(venueId).length
}

// ---------------------------------------------------------------- events
export function getEvent(id) {
  return db.events.find((e) => e.id === Number(id)) || null
}

export function seatClassesOf(eventId) {
  return db.seatClasses.filter((c) => c.event_id === Number(eventId))
}

export function zonesOf(eventId) {
  return db.eventZones.filter((z) => z.event_id === Number(eventId))
}

export function eventSeatsOf(eventId) {
  const seats = db.eventSeats.filter((s) => s.event_id === Number(eventId))
  return seats.map((s) => {
    const vs = db.venueSeats.find((v) => v.id === s.venue_seat_id)
    return { ...s, ...vs, id: s.id, venue_seat_id: s.venue_seat_id }
  })
}

export function zoneRemaining(zone) {
  return Math.max(0, zone.capacity - zone.held_qty - zone.sold_qty)
}

/** Cheapest ticket on the event, in USD cents — the "From $x" price. */
export function minPriceCents(eventId) {
  const prices = [
    ...seatClassesOf(eventId).map((c) => c.price_usd_cents),
    ...zonesOf(eventId).map((z) => z.price_usd_cents),
  ]
  return prices.length ? Math.min(...prices) : 0
}

export function inventorySummary(eventId) {
  const seats = db.eventSeats.filter((s) => s.event_id === Number(eventId))
  const zones = zonesOf(eventId)
  const seatTotal = seats.filter((s) => s.status !== 'BLOCKED').length
  const seatSold = seats.filter((s) => s.status === 'SOLD').length
  const seatHeld = seats.filter((s) => s.status === 'HELD').length
  const zoneTotal = zones.reduce((a, z) => a + z.capacity, 0)
  const zoneSold = zones.reduce((a, z) => a + z.sold_qty, 0)
  const zoneHeld = zones.reduce((a, z) => a + z.held_qty, 0)
  const capacity = seatTotal + zoneTotal
  const sold = seatSold + zoneSold
  const held = seatHeld + zoneHeld
  return {
    capacity,
    sold,
    held,
    remaining: Math.max(0, capacity - sold - held),
    pctSold: capacity ? Math.round((sold / capacity) * 100) : 0,
  }
}

/** Scarcity copy for cards: exact counts only while comfortably above zero. */
export function scarcity(eventId) {
  const { capacity, remaining } = inventorySummary(eventId)
  if (!capacity) return { level: 'none' }
  if (remaining === 0) return { level: 'sold-out' }
  const pct = remaining / capacity
  if (remaining <= 12) return { level: 'almost-full' }
  if (pct <= 0.2) return { level: 'filling', remaining }
  return { level: 'ok', remaining }
}

export function listEvents({
  q = '',
  province = '',
  from = '',
  to = '',
  minUsd = '',
  maxUsd = '',
  status = 'PUBLISHED',
  organizerId = null,
  sort = 'soonest',
} = {}) {
  const needle = q.trim().toLowerCase()
  let out = db.events.filter((e) => {
    if (status && status !== 'ALL' && e.status !== status) return false
    if (organizerId && e.organizer_id !== Number(organizerId)) return false
    const venue = getVenue(e.venue_id)
    if (province && venue?.province_code !== province) return false
    if (needle) {
      const hay = [e.title_en, e.title_km, venue?.name_en, venue?.name_km, e.description_en]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(needle)) return false
    }
    const startMs = new Date(e.starts_at).getTime()
    if (from && startMs < new Date(from).getTime()) return false
    if (to && startMs > new Date(to).getTime() + 86400000) return false
    const price = minPriceCents(e.id) / 100
    if (minUsd !== '' && price < Number(minUsd)) return false
    if (maxUsd !== '' && price > Number(maxUsd)) return false
    return true
  })

  out = [...out]
  if (sort === 'priceLow') out.sort((a, b) => minPriceCents(a.id) - minPriceCents(b.id))
  else if (sort === 'priceHigh') out.sort((a, b) => minPriceCents(b.id) - minPriceCents(a.id))
  else out.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  return out
}

// ----------------------------------------------------------------- holds
export function getActiveHold(eventId, userId) {
  sweepExpired()
  return (
    db.holds.find(
      (h) => h.event_id === Number(eventId) && h.user_id === Number(userId) && h.status === 'ACTIVE',
    ) || null
  )
}

export function getHold(holdId) {
  return db.holds.find((h) => h.id === Number(holdId)) || null
}

export function activeHoldsForUser(userId) {
  sweepExpired()
  return db.holds.filter((h) => h.user_id === Number(userId) && h.status === 'ACTIVE')
}

/** Seats + zone lines a hold covers, resolved for display. */
export function holdContents(holdId) {
  const hold = getHold(holdId)
  if (!hold) return { seats: [], zoneLines: [], subtotalUsdCents: 0 }
  const seats = eventSeatsOf(hold.event_id)
    .filter((s) => s.hold_id === hold.id)
    .map((s) => ({ ...s, seat_class: db.seatClasses.find((c) => c.id === s.seat_class_id) }))
  const zoneLines = holdZoneLines(hold.id).map((l) => ({
    ...l,
    zone: db.eventZones.find((z) => z.id === l.event_zone_id),
  }))
  const subtotalUsdCents =
    seats.reduce((a, s) => a + (s.seat_class?.price_usd_cents || 0), 0) +
    zoneLines.reduce((a, l) => a + (l.zone?.price_usd_cents || 0) * l.qty, 0)
  return { hold, seats, zoneLines, subtotalUsdCents }
}

/**
 * Reserves specific seats and/or GA quantities. Rejects a second concurrent
 * hold the same way the backend's unique index does.
 */
export function createHold({ eventId, userId, seatIds = [], zoneQty = {}, ttlMs = HOLD_TTL_MS }) {
  sweepExpired()
  const existing = getActiveHold(eventId, userId)
  if (existing) return { error: 'HOLD_ALREADY_ACTIVE', hold: existing }

  // Validate before mutating anything.
  const seats = seatIds.map((id) => db.eventSeats.find((s) => s.id === Number(id)))
  if (seats.some((s) => !s || s.status !== 'AVAILABLE')) return { error: 'SEAT_UNAVAILABLE' }

  const zoneEntries = Object.entries(zoneQty).filter(([, qty]) => Number(qty) > 0)
  for (const [zoneId, qty] of zoneEntries) {
    const zone = db.eventZones.find((z) => z.id === Number(zoneId))
    if (!zone) return { error: 'ZONE_NOT_FOUND' }
    if (Number(qty) > zoneRemaining(zone)) return { error: 'ZONE_CAPACITY' }
  }
  if (!seats.length && !zoneEntries.length) return { error: 'EMPTY_SELECTION' }

  const hold = {
    id: db.counters.nextHoldId(),
    event_id: Number(eventId),
    user_id: Number(userId),
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    created_at: new Date().toISOString(),
    extended: false,
  }
  db.holds.push(hold)

  for (const seat of seats) {
    seat.status = 'HELD'
    seat.hold_id = hold.id
    seat.hold_expires_at = hold.expires_at
    seat.version += 1
  }
  const lines = []
  for (const [zoneId, qty] of zoneEntries) {
    const zone = db.eventZones.find((z) => z.id === Number(zoneId))
    zone.held_qty += Number(qty)
    zone.version += 1
    lines.push({ id: `${hold.id}-${zoneId}`, hold_id: hold.id, event_zone_id: zone.id, qty: Number(qty) })
  }
  setHoldZoneLines(hold.id, lines)

  emit()
  return { hold }
}

/** One-time extension, matching hold.extended in the schema. */
export function extendHold(holdId) {
  const hold = getHold(holdId)
  if (!hold || hold.status !== 'ACTIVE') return { error: 'HOLD_NOT_ACTIVE' }
  if (hold.extended) return { error: 'ALREADY_EXTENDED' }
  hold.extended = true
  hold.expires_at = new Date(
    Math.max(Date.now(), new Date(hold.expires_at).getTime()) + HOLD_EXTENSION_MS,
  ).toISOString()
  for (const seat of db.eventSeats) {
    if (seat.hold_id === hold.id) seat.hold_expires_at = hold.expires_at
  }
  emit()
  return { hold }
}

export function releaseHold(holdId, { reason = 'RELEASED' } = {}) {
  const hold = getHold(holdId)
  if (!hold || hold.status !== 'ACTIVE') return { error: 'HOLD_NOT_ACTIVE' }
  hold.status = reason
  for (const seat of db.eventSeats) {
    if (seat.hold_id === hold.id && seat.status === 'HELD') {
      seat.status = 'AVAILABLE'
      seat.hold_id = null
      seat.hold_expires_at = null
    }
  }
  for (const line of holdZoneLines(hold.id)) {
    const zone = db.eventZones.find((z) => z.id === line.event_zone_id)
    if (zone) zone.held_qty = Math.max(0, zone.held_qty - line.qty)
  }
  emit()
  return { hold }
}

// -------------------------------------------------------------- bookings
export function getBooking(id) {
  return db.bookings.find((b) => b.id === Number(id)) || null
}

export function getBookingByRef(ref) {
  return db.bookings.find((b) => b.booking_ref === ref) || null
}

export function itemsOf(bookingId) {
  return db.bookingItems
    .filter((i) => i.booking_id === Number(bookingId))
    .map((i) => {
      if (i.event_seat_id) {
        const es = db.eventSeats.find((s) => s.id === i.event_seat_id)
        const vs = es ? db.venueSeats.find((v) => v.id === es.venue_seat_id) : null
        const cls = es ? db.seatClasses.find((c) => c.id === es.seat_class_id) : null
        return { ...i, kind: 'SEAT', seat: vs, seatClass: cls }
      }
      const zone = db.eventZones.find((z) => z.id === i.event_zone_id)
      return { ...i, kind: 'ZONE', zone }
    })
}

export function ticketsOf(bookingId) {
  const itemIds = db.bookingItems.filter((i) => i.booking_id === Number(bookingId)).map((i) => i.id)
  return db.tickets.filter((t) => itemIds.includes(t.booking_item_id))
}

export function paymentsForBooking(bookingId) {
  return db.payments
    .filter((p) => p.booking_id === Number(bookingId))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export function historyOf(bookingId) {
  return db.bookingHistory
    .filter((h) => h.booking_id === Number(bookingId))
    .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
}

export function listBookings({ userId = null, state = '', eventId = null } = {}) {
  sweepExpired()
  return db.bookings
    .filter((b) => {
      if (userId && b.user_id !== Number(userId)) return false
      if (eventId && b.event_id !== Number(eventId)) return false
      if (state && b.state !== state) return false
      return true
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/** Turns an active hold into a PENDING_PAYMENT booking. */
export function createBooking({ holdId, userId, buyer, provider }) {
  sweepExpired()
  const hold = getHold(holdId)
  if (!hold || hold.status !== 'ACTIVE') return { error: 'HOLD_NOT_ACTIVE' }
  const existing = db.bookings.find((b) => b.hold_id === hold.id)
  if (existing) return { booking: existing } // idempotent: same hold, same booking

  const { seats, zoneLines, subtotalUsdCents } = holdContents(hold.id)
  if (!subtotalUsdCents) return { error: 'EMPTY_HOLD' }

  const booking = {
    id: db.counters.nextBookingId(),
    booking_ref: db.counters.nextRef(),
    event_id: hold.event_id,
    user_id: Number(userId),
    hold_id: hold.id,
    state: 'PENDING_PAYMENT',
    buyer_name: buyer.name,
    buyer_phone_e164: buyer.phone,
    buyer_email: buyer.email || null,
    subtotal_usd_cents: subtotalUsdCents,
    total_usd_cents: subtotalUsdCents,
    fx_rate_khr_per_usd: FX_RATE_KHR_PER_USD,
    total_khr: khrFromUsdCents(subtotalUsdCents),
    created_at: new Date().toISOString(),
    state_changed_at: new Date().toISOString(),
  }
  db.bookings.push(booking)

  for (const s of seats) {
    db.bookingItems.push({
      id: db.counters.nextItemId(),
      booking_id: booking.id,
      event_seat_id: s.id,
      event_zone_id: null,
      qty: 1,
      unit_price_usd_cents: s.seat_class.price_usd_cents,
    })
  }
  for (const l of zoneLines) {
    db.bookingItems.push({
      id: db.counters.nextItemId(),
      booking_id: booking.id,
      event_seat_id: null,
      event_zone_id: l.event_zone_id,
      qty: l.qty,
      unit_price_usd_cents: l.zone.price_usd_cents,
    })
  }

  db.bookingHistory.push({
    id: db.counters.nextHistoryId(),
    booking_id: booking.id,
    from_state: null,
    to_state: 'PENDING_PAYMENT',
    changed_by_user_id: Number(userId),
    note: null,
    changed_at: booking.created_at,
  })

  startPayment(booking.id, provider)
  emit()
  return { booking }
}

/** Opens a payment attempt (KHQR QR or PayWay redirect). */
export function startPayment(bookingId, provider) {
  const booking = getBooking(bookingId)
  if (!booking) return { error: 'NO_BOOKING' }
  if (paymentsForBooking(booking.id).some((p) => p.status === 'SUCCESS')) {
    return { error: 'ALREADY_PAID' }
  }
  // Retiring any open attempt keeps at most one live QR per booking.
  for (const p of paymentsForBooking(booking.id)) {
    if (['CREATED', 'PENDING'].includes(p.status)) {
      p.status = 'CANCELLED'
      p.resolved_at = new Date().toISOString()
    }
  }
  const payment = {
    id: db.counters.nextPaymentId(),
    booking_id: booking.id,
    provider,
    provider_ref: `${provider === 'BAKONG_KHQR' ? 'BKG' : 'ABA-TXN'}-${Math.floor(
      100000 + Math.random() * 899999,
    )}`,
    idempotency_key: `idem-${booking.booking_ref}-${db.payments.length + 1}`,
    currency_charged: provider === 'BAKONG_KHQR' ? 'KHR' : 'USD',
    amount_usd_cents: booking.total_usd_cents,
    amount_khr: booking.total_khr,
    status: 'PENDING',
    expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
    created_at: new Date().toISOString(),
    resolved_at: null,
  }
  db.payments.push(payment)
  if (booking.state === 'PAYMENT_FAILED') {
    transition(booking, 'PENDING_PAYMENT', booking.user_id, 'New payment attempt')
  }
  emit()
  return { payment }
}

export function latestPayment(bookingId) {
  return paymentsForBooking(bookingId)[0] || null
}

/** Stands in for the provider webhook. */
export function resolvePayment(bookingId, outcome) {
  const booking = getBooking(bookingId)
  const payment = latestPayment(bookingId)
  if (!booking || !payment) return { error: 'NOT_FOUND' }
  if (payment.status === 'SUCCESS') return { error: 'ALREADY_PAID' }

  payment.status = outcome
  payment.resolved_at = new Date().toISOString()

  if (outcome === 'SUCCESS') {
    confirmBooking(booking)
  } else if (outcome === 'FAILED') {
    transition(booking, 'PAYMENT_FAILED', null, `${payment.provider} declined`)
  } else if (outcome === 'CANCELLED') {
    transition(booking, 'CANCELLED', booking.user_id, 'Payment cancelled')
    releaseHold(booking.hold_id)
  }
  emit()
  return { payment, booking }
}

function confirmBooking(booking) {
  const hold = getHold(booking.hold_id)
  const items = db.bookingItems.filter((i) => i.booking_id === booking.id)

  for (const item of items) {
    if (item.event_seat_id) {
      const seat = db.eventSeats.find((s) => s.id === item.event_seat_id)
      if (seat) {
        seat.status = 'SOLD'
        seat.hold_id = null
        seat.hold_expires_at = null
      }
    } else if (item.event_zone_id) {
      const zone = db.eventZones.find((z) => z.id === item.event_zone_id)
      if (zone) {
        zone.held_qty = Math.max(0, zone.held_qty - item.qty)
        zone.sold_qty += item.qty
      }
    }
    // One ticket per admission unit: seats get one, a GA qty of 3 gets three.
    for (let seq = 1; seq <= item.qty; seq++) {
      db.tickets.push({
        id: db.counters.nextTicketId(),
        booking_item_id: item.id,
        unit_seq: seq,
        qr_token: `${booking.booking_ref}-${item.id}-${seq}`.toLowerCase(),
        checked_in_at: null,
        checked_in_by: null,
        issued_at: new Date().toISOString(),
      })
    }
  }
  if (hold) hold.status = 'CONSUMED'
  transition(booking, 'CONFIRMED', null, 'Payment confirmed')
}

export function cancelBooking(bookingId, userId) {
  const booking = getBooking(bookingId)
  if (!booking) return { error: 'NOT_FOUND' }
  if (!['PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'PAYMENT_FAILED'].includes(booking.state)) {
    return { error: 'NOT_CANCELLABLE' }
  }
  transition(booking, 'CANCELLED', userId, 'Cancelled by customer')
  for (const p of paymentsForBooking(booking.id)) {
    if (['CREATED', 'PENDING'].includes(p.status)) {
      p.status = 'CANCELLED'
      p.resolved_at = new Date().toISOString()
    }
  }
  releaseHold(booking.hold_id)
  emit()
  return { booking }
}

export function requestRefund(bookingId, userId) {
  const booking = getBooking(bookingId)
  if (!booking || booking.state !== 'CONFIRMED') return { error: 'NOT_REFUNDABLE' }
  transition(booking, 'REFUND_REQUESTED', userId, 'Refund requested by customer')
  emit()
  return { booking }
}

export function approveRefund(bookingId, adminId) {
  const booking = getBooking(bookingId)
  if (!booking || booking.state !== 'REFUND_REQUESTED') return { error: 'NOT_PENDING_REFUND' }
  transition(booking, 'REFUNDED', adminId, 'Refunded to source')
  // Inventory goes back on sale.
  for (const item of db.bookingItems.filter((i) => i.booking_id === booking.id)) {
    if (item.event_seat_id) {
      const seat = db.eventSeats.find((s) => s.id === item.event_seat_id)
      if (seat && seat.status === 'SOLD') seat.status = 'AVAILABLE'
    } else if (item.event_zone_id) {
      const zone = db.eventZones.find((z) => z.id === item.event_zone_id)
      if (zone) zone.sold_qty = Math.max(0, zone.sold_qty - item.qty)
    }
  }
  emit()
  return { booking }
}

// --------------------------------------------------------------- tickets
export function ticketDetail(ticket) {
  const item = db.bookingItems.find((i) => i.id === ticket.booking_item_id)
  const booking = item ? getBooking(item.booking_id) : null
  const event = booking ? getEvent(booking.event_id) : null
  let label = ''
  if (item?.event_seat_id) {
    const es = db.eventSeats.find((s) => s.id === item.event_seat_id)
    const vs = es ? db.venueSeats.find((v) => v.id === es.venue_seat_id) : null
    label = vs ? `${vs.section_label} · ${vs.row_label}${vs.seat_number}` : 'Seat'
  } else if (item?.event_zone_id) {
    const zone = db.eventZones.find((z) => z.id === item.event_zone_id)
    label = `${zone?.name_en || 'GA'} · #${ticket.unit_seq}`
  }
  return { ticket, item, booking, event, label }
}

/** Door scan. Mirrors the three outcomes the check-in screen has to show. */
export function checkInTicket(token, byUserId) {
  const clean = (token || '').trim().toLowerCase()
  const ticket = db.tickets.find((t) => t.qr_token === clean)
  if (!ticket) return { result: 'NOT_FOUND' }
  const detail = ticketDetail(ticket)
  if (detail.booking?.state !== 'CONFIRMED') {
    return { result: 'NOT_VALID', detail, reason: detail.booking?.state }
  }
  if (ticket.checked_in_at) {
    return { result: 'ALREADY_USED', detail, at: ticket.checked_in_at }
  }
  ticket.checked_in_at = new Date().toISOString()
  ticket.checked_in_by = byUserId
  emit()
  return { result: 'VALID', detail }
}

export function recentCheckIns(organizerId, limit = 8) {
  return db.tickets
    .filter((t) => {
      if (!t.checked_in_at) return false
      const d = ticketDetail(t)
      return !organizerId || d.event?.organizer_id === Number(organizerId)
    })
    .sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at))
    .slice(0, limit)
    .map(ticketDetail)
}

// ------------------------------------------------------------- organizer
export function createVenue(data) {
  const venue = { id: db.counters.nextVenueId(), created_at: new Date().toISOString(), ...data }
  db.venues.push(venue)
  emit()
  return venue
}

export function updateVenue(id, data) {
  const venue = getVenue(id)
  if (!venue) return { error: 'NOT_FOUND' }
  Object.assign(venue, data)
  emit()
  return venue
}

/** Grid generator — v1 seat-map authoring, per the brief. */
export function generateSeatBlock(venueId, { section_label, rows, cols }) {
  const existing = venueSeatsOf(venueId)
  const sectionRows = existing.filter((s) => s.section_label === section_label)
  if (sectionRows.length) return { error: 'SECTION_EXISTS' }
  const startY = existing.length
    ? Math.max(...existing.map((s) => s.pos_y)) + 75
    : 40
  const created = []
  for (let r = 0; r < rows; r++) {
    const rowLabel = String.fromCharCode(65 + r)
    for (let c = 0; c < cols; c++) {
      const seat = {
        id: db.counters.nextVenueSeatId(),
        venue_id: Number(venueId),
        section_label,
        row_label: rowLabel,
        seat_number: String(c + 1),
        pos_x: 40 + c * 30,
        pos_y: startY + r * 30,
      }
      db.venueSeats.push(seat)
      created.push(seat)
    }
  }
  emit()
  return { created }
}

export function deleteSeatSection(venueId, sectionLabel) {
  const keep = db.venueSeats.filter(
    (s) => !(s.venue_id === Number(venueId) && s.section_label === sectionLabel),
  )
  db.venueSeats.length = 0
  db.venueSeats.push(...keep)
  emit()
}

export function createEvent(data) {
  const event = {
    id: db.counters.nextEventId(),
    status: 'DRAFT',
    created_at: new Date().toISOString(),
    cover: data.cover || 'indigo',
    category: data.category || 'music',
    ...data,
  }
  db.events.push(event)
  applyInventory(event, data.classes || [], data.zones || [])
  emit()
  return event
}

export function updateEvent(id, data) {
  const event = getEvent(id)
  if (!event) return { error: 'NOT_FOUND' }
  const { classes, zones, ...rest } = data
  Object.assign(event, rest)
  applyInventory(event, classes || [], zones || [])
  emit()
  return event
}

/**
 * Rewrites pricing tiers for an event. Seat classes map onto venue sections;
 * publishing is what expands venue_seat -> event_seat.
 */
function applyInventory(event, classes, zones) {
  if (['SEATED', 'MIXED'].includes(event.inventory_mode)) {
    for (const c of classes) {
      const existing = db.seatClasses.find(
        (x) => x.event_id === event.id && x.section_label === c.section_label,
      )
      if (existing) {
        Object.assign(existing, c)
      } else {
        db.seatClasses.push({
          id: db.counters.nextSeatClassId(),
          event_id: event.id,
          section_label: c.section_label,
          name_en: c.name_en,
          name_km: c.name_km,
          price_usd_cents: c.price_usd_cents,
        })
      }
    }
  }
  if (['ZONED', 'MIXED'].includes(event.inventory_mode)) {
    for (const z of zones) {
      const existing = db.eventZones.find((x) => x.event_id === event.id && x.name_en === z.name_en)
      if (existing) {
        // Never shrink capacity below what is already committed.
        existing.price_usd_cents = z.price_usd_cents
        existing.capacity = Math.max(z.capacity, existing.held_qty + existing.sold_qty)
        existing.name_km = z.name_km
      } else {
        db.eventZones.push({
          id: db.counters.nextZoneId(),
          event_id: event.id,
          name_en: z.name_en,
          name_km: z.name_km,
          price_usd_cents: z.price_usd_cents,
          capacity: z.capacity,
          held_qty: 0,
          sold_qty: 0,
          version: 0,
        })
      }
    }
  }
}

export function setEventStatus(eventId, status) {
  const event = getEvent(eventId)
  if (!event) return { error: 'NOT_FOUND' }
  event.status = status
  // Publishing a seated event materialises its event_seat rows.
  if (status === 'PUBLISHED' && ['SEATED', 'MIXED'].includes(event.inventory_mode)) {
    const classes = seatClassesOf(event.id)
    for (const vs of venueSeatsOf(event.venue_id)) {
      const cls = classes.find((c) => c.section_label === vs.section_label)
      if (!cls) continue
      const already = db.eventSeats.find(
        (s) => s.event_id === event.id && s.venue_seat_id === vs.id,
      )
      if (already) continue
      db.eventSeats.push({
        id: db.counters.nextEventSeatId(),
        event_id: event.id,
        venue_seat_id: vs.id,
        seat_class_id: cls.id,
        status: 'AVAILABLE',
        hold_id: null,
        hold_expires_at: null,
        version: 0,
      })
    }
  }
  emit()
  return event
}

export function salesSummary(eventId) {
  const event = getEvent(eventId)
  const classes = seatClassesOf(eventId)
  const zones = zonesOf(eventId)
  const seats = db.eventSeats.filter((s) => s.event_id === Number(eventId))

  const byClass = classes.map((c) => {
    const pool = seats.filter((s) => s.seat_class_id === c.id)
    const sold = pool.filter((s) => s.status === 'SOLD').length
    const held = pool.filter((s) => s.status === 'HELD').length
    return {
      kind: 'SEAT',
      id: c.id,
      name_en: c.name_en,
      name_km: c.name_km,
      price_usd_cents: c.price_usd_cents,
      capacity: pool.filter((s) => s.status !== 'BLOCKED').length,
      sold,
      held,
      revenue_usd_cents: sold * c.price_usd_cents,
    }
  })

  const byZone = zones.map((z) => ({
    kind: 'ZONE',
    id: z.id,
    name_en: z.name_en,
    name_km: z.name_km,
    price_usd_cents: z.price_usd_cents,
    capacity: z.capacity,
    sold: z.sold_qty,
    held: z.held_qty,
    revenue_usd_cents: z.sold_qty * z.price_usd_cents,
  }))

  const lines = [...byClass, ...byZone]
  const revenue_usd_cents = lines.reduce((a, l) => a + l.revenue_usd_cents, 0)
  const sold = lines.reduce((a, l) => a + l.sold, 0)
  const capacity = lines.reduce((a, l) => a + l.capacity, 0)

  const stateCounts = {}
  for (const b of listBookings({ eventId })) {
    stateCounts[b.state] = (stateCounts[b.state] || 0) + 1
  }

  const checkedIn = db.tickets.filter((t) => {
    if (!t.checked_in_at) return false
    return ticketDetail(t).event?.id === Number(eventId)
  }).length

  return { event, lines, revenue_usd_cents, sold, capacity, stateCounts, checkedIn }
}

// ------------------------------------------------------------------ admin
export function listUsers({ q = '', role = '', disabled = '' } = {}) {
  const needle = q.trim().toLowerCase()
  return db.users.filter((u) => {
    if (role && u.role !== role) return false
    if (disabled === 'yes' && !u.is_disabled) return false
    if (disabled === 'no' && u.is_disabled) return false
    if (needle) {
      const hay = [u.display_name, u.phone_e164, u.email].join(' ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

export function setUserDisabled(userId, disabled) {
  const user = getUserById(userId)
  if (!user) return { error: 'NOT_FOUND' }
  user.is_disabled = disabled
  emit()
  return user
}

export function listPayments({ provider = '', status = '', stuckOnly = false } = {}) {
  const cutoff = Date.now() - 60 * 60 * 1000 // "pending too long" threshold: 1h
  return db.payments
    .filter((p) => {
      if (provider && p.provider !== provider) return false
      if (status && p.status !== status) return false
      if (stuckOnly) {
        if (!['PENDING', 'CREATED'].includes(p.status)) return false
        if (new Date(p.created_at).getTime() > cutoff) return false
      }
      return true
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((p) => {
      const booking = getBooking(p.booking_id)
      return {
        ...p,
        booking,
        event: booking ? getEvent(booking.event_id) : null,
        stuck:
          ['PENDING', 'CREATED'].includes(p.status) && new Date(p.created_at).getTime() <= cutoff,
      }
    })
}

export function platformStats() {
  sweepExpired()
  const confirmed = db.bookings.filter((b) => b.state === 'CONFIRMED')
  const grossUsdCents = db.payments
    .filter((p) => p.status === 'SUCCESS')
    .reduce((a, p) => a + p.amount_usd_cents, 0)
  return {
    users: db.users.length,
    customers: db.users.filter((u) => u.role === 'CUSTOMER').length,
    organizers: db.users.filter((u) => u.role === 'ORGANIZER').length,
    disabled: db.users.filter((u) => u.is_disabled).length,
    events: db.events.length,
    published: db.events.filter((e) => e.status === 'PUBLISHED').length,
    drafts: db.events.filter((e) => e.status === 'DRAFT').length,
    takenDown: db.events.filter((e) => e.status === 'TAKEN_DOWN').length,
    bookings: db.bookings.length,
    confirmed: confirmed.length,
    grossUsdCents,
    ticketsIssued: db.tickets.length,
    checkedIn: db.tickets.filter((t) => t.checked_in_at).length,
    awaitingConfirmation: db.bookings.filter((b) => b.state === 'AWAITING_CONFIRMATION').length,
    stuckPayments: listPayments({ stuckOnly: true }).length,
    refundRequests: db.bookings.filter((b) => b.state === 'REFUND_REQUESTED').length,
  }
}

export function recentBookings(limit = 8) {
  return listBookings({})
    .slice(0, limit)
    .map((b) => ({ ...b, event: getEvent(b.event_id), user: getUserById(b.user_id) }))
}

export { HOLD_TTL_MS, HOLD_EXTENSION_MS }
export default db
