/**
 * Frontend Adapter / Mapping Layer
 * Converts flat backend Spring Boot DTO shapes into nested structures
 * expected by existing React UI components (SeatMap, ZonePicker, CheckoutPage, etc.)
 */

/**
 * Maps SeatClassResponse
 */
export function mapSeatClass(c) {
  if (!c) return null
  return {
    id: c.id,
    event_id: c.event_id ?? c.eventId,
    name_en: c.name_en ?? c.nameEn,
    name_km: c.name_km ?? c.nameKm,
    price_usd_cents: c.price_usd_cents ?? c.priceUsdCents,
  }
}

/**
 * Maps ZoneAvailabilityResponse / EventZoneResponse
 * Compatible with ZonePicker.jsx
 */
export function mapZone(z) {
  if (!z) return null
  return {
    id: z.id ?? z.zone_id ?? z.zoneId,
    event_id: z.event_id ?? z.eventId,
    name_en: z.name_en ?? z.nameEn ?? z.zone_name ?? z.zoneName,
    name_km: z.name_km ?? z.nameKm ?? z.name_en ?? z.nameEn,
    capacity: z.capacity ?? 0,
    held_qty: z.held_qty ?? z.heldQty ?? 0,
    sold_qty: z.sold_qty ?? z.soldQty ?? 0,
    price_usd_cents: z.price_usd_cents ?? z.priceUsdCents ?? z.unit_price_usd_cents ?? z.unitPriceUsdCents ?? 0,
  }
}

/**
 * Maps EventResponse
 */
export function mapEvent(e) {
  if (!e) return null
  return {
    id: e.id,
    organizer_id: e.organizer_id ?? e.organizerId,
    venue_id: e.venue_id ?? e.venueId,
    venue: e.venue, // Keep the venue object!
    inventory_mode: e.inventory_mode ?? e.inventoryMode,
    slug: e.slug,
    title_en: e.title_en ?? e.titleEn,
    title_km: e.title_km ?? e.titleKm,
    description_en: e.description_en ?? e.descriptionEn,
    description_km: e.description_km ?? e.descriptionKm,
    starts_at: e.starts_at ?? e.startsAt,
    doors_open_at: e.doors_open_at ?? e.doorsOpenAt,
    sales_open_at: e.sales_open_at ?? e.salesOpenAt,
    sales_close_at: e.sales_close_at ?? e.salesCloseAt,
    status: e.status,
    created_at: e.created_at ?? e.createdAt,
    updated_at: e.updated_at ?? e.updatedAt,
    seat_classes: (e.seat_classes ?? e.seatClasses ?? []).map(mapSeatClass),
    zones: (e.zones ?? []).map(mapZone),
  }
}

/**
 * Maps SeatMapResponse / SeatAvailabilityResponse List
 * Compatible with SeatMap.jsx
 */
export function mapSeatMap(res) {
  if (!res) return { seats: [], seat_classes: [] }
  const rawSeats = Array.isArray(res)
    ? res
    : res.seats || (res.sections || []).flatMap((section) => section.seats || [])
  const rawClasses = Array.isArray(res) ? [] : res.seat_classes || res.seatClasses || []

  const seats = rawSeats.map((s) => ({
    id: s.id ?? s.event_seat_id ?? s.eventSeatId,
    event_seat_id: s.event_seat_id ?? s.eventSeatId ?? s.id,
    event_id: s.event_id ?? s.eventId,
    venue_seat_id: s.venue_seat_id ?? s.venueSeatId,
    section_label: s.section_label ?? s.sectionLabel,
    row_label: s.row_label ?? s.rowLabel,
    seat_number: s.seat_number ?? s.seatNumber,
    seat_class_id: s.seat_class_id ?? s.seatClassId,
    seat_class_name_en: s.seat_class_name_en ?? s.seatClassNameEn,
    price_usd_cents: s.price_usd_cents ?? s.priceUsdCents,
    status: s.status,
    pos_x: s.pos_x ?? s.posX,
    pos_y: s.pos_y ?? s.posY,
  }))

  const seatClasses = rawClasses.map(mapSeatClass)

  return { seats, seat_classes: seatClasses }
}

/**
 * Maps HoldResponse
 * Compatible with CheckoutPage.jsx and HoldBar.jsx
 */
export function mapHoldResponse(res) {
  if (!res) return { hold: null, seats: [], zoneLines: [], subtotalUsdCents: 0 }

  const hold = {
    id: res.id,
    event_id: res.event_id ?? res.eventId,
    user_id: res.user_id ?? res.userId,
    status: res.status,
    expires_at: res.expires_at ?? res.expiresAt,
    created_at: res.created_at ?? res.createdAt,
    extended: Boolean(res.extended),
  }

  const seats = (res.seats || []).map((s) => ({
    id: s.event_seat_id ?? s.eventSeatId ?? s.id,
    event_seat_id: s.event_seat_id ?? s.eventSeatId ?? s.id,
    section_label: s.section_label ?? s.sectionLabel,
    row_label: s.row_label ?? s.rowLabel,
    seat_number: s.seat_number ?? s.seatNumber,
    price_usd_cents: s.price_usd_cents ?? s.priceUsdCents,
    seat_class: {
      price_usd_cents: s.price_usd_cents ?? s.priceUsdCents,
    },
  }))

  const zoneLines = (res.zones || []).map((z) => {
    const unitPrice = z.unit_price_usd_cents ?? z.unitPriceUsdCents ?? z.price_usd_cents ?? z.priceUsdCents ?? 0
    const qty = z.qty ?? 0
    return {
      event_zone_id: z.event_zone_id ?? z.eventZoneId ?? z.id,
      qty,
      lineTotalCents: unitPrice * qty,
      zone: {
        id: z.event_zone_id ?? z.eventZoneId ?? z.id,
        name_en: z.name_en ?? z.nameEn,
        name_km: z.name_km ?? z.nameKm ?? z.name_en ?? z.nameEn,
        price_usd_cents: unitPrice,
      },
    }
  })

  const subtotalUsdCents =
    res.total_usd_cents ??
    res.totalUsdCents ??
    seats.reduce((a, s) => a + (s.price_usd_cents || 0), 0) +
      zoneLines.reduce((a, l) => a + l.lineTotalCents, 0)

  return { hold, seats, zoneLines, subtotalUsdCents }
}

export function mapBookingItem(i) {
  if (!i) return null
  return {
    id: i.id,
    booking_id: i.bookingId ?? i.booking_id,
    kind: i.kind,
    qty: i.qty,
    unit_price_usd_cents: i.unitPriceUsdCents ?? i.unit_price_usd_cents,
    // The backend hasn't fully implemented seat/zone objects in the item response yet,
    // so we pass them through if they exist, or mock them empty for the UI to not crash.
    seat: i.seat,
    zone: i.zone,
    seatClass: i.seatClass
  }
}

export function mapBooking(b) {
  if (!b) return null
  return {
    id: b.id,
    booking_ref: b.bookingRef ?? b.booking_ref,
    event_id: b.eventId ?? b.event_id,
    user_id: b.userId ?? b.user_id,
    hold_id: b.holdId ?? b.hold_id,
    state: b.state,
    buyer_name: b.buyerName ?? b.buyer_name,
    buyer_phone_e164: b.buyerPhoneE164 ?? b.buyer_phone_e164,
    buyer_email: b.buyerEmail ?? b.buyer_email,
    subtotal_usd_cents: b.subtotalUsdCents ?? b.subtotal_usd_cents,
    total_usd_cents: b.totalUsdCents ?? b.total_usd_cents,
    fx_rate_khr_per_usd: b.fxRateKhrPerUsd ?? b.fx_rate_khr_per_usd,
    total_khr: b.totalKhr ?? b.total_khr,
    created_at: b.createdAt ?? b.created_at,
    state_changed_at: b.stateChangedAt ?? b.state_changed_at,
    items: (b.items || []).map(mapBookingItem)
  }
}
