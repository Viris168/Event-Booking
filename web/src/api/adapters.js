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
    seat_count: c.seat_count ?? c.seatCount ?? 0,
    sold_count: c.sold_count ?? c.soldCount ?? 0,
    held_count: c.held_count ?? c.heldCount ?? 0,
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
    // Event-wide inventory, seats and zones together. These were being dropped
    // here, which is why the capacity panel read 0 / 0 on every event.
    total_capacity: e.total_capacity ?? e.totalCapacity ?? 0,
    total_sold: e.total_sold ?? e.totalSold ?? 0,
    total_held: e.total_held ?? e.totalHeld ?? 0,
    // Carried here as well as in eventImages(): the venue-layout panel and
    // the listing cards both read a mapped event, not a raw response.
    cover_image_url: e.coverImageUrl ?? e.cover_image_url ?? null,
    banner_image_url: e.bannerImageUrl ?? e.banner_image_url ?? null,
    // Both were being dropped, and both are read by every card: `category`
    // keys CATEGORY_ICON (an undefined key silently fell back to the generic
    // ticket glyph on every event) and `cover` picks the fallback gradient
    // (without it the colour came from a title hash, not the organiser's pick).
    category: e.category ?? null,
    cover: e.cover ?? null,
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

  // BookingItemResponse populates exactly one of eventSeatId / eventZoneId, and
  // that is what says which kind of line this is — there is no `kind` field on
  // the wire. `label` is the seat class or zone name, already resolved server
  // side, so the UI does not need the seat or zone object to print a line.
  const eventSeatId = i.eventSeatId ?? i.event_seat_id ?? null
  const eventZoneId = i.eventZoneId ?? i.event_zone_id ?? null
  const unitPrice = i.unitPriceUsdCents ?? i.unit_price_usd_cents ?? 0
  const qty = i.qty ?? 1

  return {
    id: i.id,
    kind: eventSeatId ? 'SEAT' : 'ZONE',
    event_seat_id: eventSeatId,
    event_zone_id: eventZoneId,
    label: i.label,
    qty,
    unit_price_usd_cents: unitPrice,
    line_total_usd_cents: i.lineTotalUsdCents ?? i.line_total_usd_cents ?? unitPrice * qty,
  }
}

/**
 * Maps TicketResponse. One of these is one admission unit — a zone line bought
 * three at a time yields three, numbered by unit_seq.
 */
export function mapTicket(t) {
  if (!t) return null
  return {
    id: t.id,
    booking_id: t.bookingId ?? t.booking_id,
    booking_ref: t.bookingRef ?? t.booking_ref,
    event_id: t.eventId ?? t.event_id,
    event_title_en: t.eventTitleEn ?? t.event_title_en,
    event_title_km: t.eventTitleKm ?? t.event_title_km,
    event_starts_at: t.eventStartsAt ?? t.event_starts_at,
    tier_name: t.tierName ?? t.tier_name,
    // Null for a zone ticket: standing admission has no seat, and the UI must
    // not invent one.
    seat_location: t.seatLocation ?? t.seat_location ?? null,
    unit_seq: t.unitSeq ?? t.unit_seq,
    units_in_line: t.unitsInLine ?? t.units_in_line,
    qr_payload: t.qrPayload ?? t.qr_payload,
    issued_at: t.issuedAt ?? t.issued_at,
    checked_in: t.checkedIn ?? t.checked_in ?? false,
    checked_in_at: t.checkedInAt ?? t.checked_in_at ?? null,
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

/**
 * The gate's verdict.
 *
 * `outcome` is the server's enum and is passed through untouched — the UI
 * groups the seven values into three colours, but the raw value is what a
 * steward's screen and any future log line should key on. `admitted` is the
 * only field a turnstile needs.
 *
 * `ticket` is null when the code could not be tied to a ticket at all
 * (MALFORMED, BAD_SIGNATURE, UNKNOWN_TICKET), so every read of it is guarded.
 */
export function mapScanResult(r) {
  if (!r) return null
  const ticket = r.ticket ?? null
  const booking = r.booking ?? null
  return {
    admitted: r.admitted ?? false,
    outcome: r.outcome,
    message: r.message,
    previous_check_in_at: r.previousCheckInAt ?? r.previous_check_in_at ?? null,
    ticket: ticket && {
      ticket_id: ticket.ticketId ?? ticket.ticket_id,
      booking_ref: ticket.bookingRef ?? ticket.booking_ref,
      buyer_name: ticket.buyerName ?? ticket.buyer_name,
      event_title_en: ticket.eventTitleEn ?? ticket.event_title_en,
      tier_name: ticket.tierName ?? ticket.tier_name,
      seat_location: ticket.seatLocation ?? ticket.seat_location ?? null,
      unit_seq: ticket.unitSeq ?? ticket.unit_seq,
      units_in_line: ticket.unitsInLine ?? ticket.units_in_line,
    },
    // How much of the party is through. Null on codes that matched no ticket.
    booking: booking && {
      total: booking.total,
      checked_in: booking.checkedIn ?? booking.checked_in,
      remaining: booking.remaining,
    },
  }
}

/** One row of a group preview — carries its own check-in state. */
function mapPreviewTicket(t) {
  return {
    ticket_id: t.ticketId ?? t.ticket_id,
    booking_item_id: t.bookingItemId ?? t.booking_item_id,
    // Seat vs zone. The whole group UI turns on this: seats are picked
    // individually because each is a specific person; zone admissions are
    // interchangeable, so a count is the honest control.
    assigned: t.assigned ?? false,
    tier_name: t.tierName ?? t.tier_name,
    seat_location: t.seatLocation ?? t.seat_location ?? null,
    unit_seq: t.unitSeq ?? t.unit_seq,
    checked_in: t.checkedIn ?? t.checked_in ?? false,
    checked_in_at: t.checkedInAt ?? t.checked_in_at ?? null,
  }
}

function mapParty(p) {
  if (!p) return null
  return {
    booking_id: p.bookingId ?? p.booking_id,
    booking_ref: p.bookingRef ?? p.booking_ref,
    buyer_name: p.buyerName ?? p.buyer_name,
    event_title_en: p.eventTitleEn ?? p.event_title_en,
  }
}

/**
 * A group preview. `admissible` is the button's enabled state — true only when
 * this is a real booking at this gate AND somebody is still outside. Note
 * `outcome: VALID` here means "real booking, right gate", never "admitted".
 */
export function mapGroupPreview(r) {
  if (!r) return null
  return {
    admissible: r.admissible ?? false,
    outcome: r.outcome,
    message: r.message,
    booking: mapParty(r.booking),
    tickets: (r.tickets || []).map(mapPreviewTicket),
    total: r.total ?? 0,
    checked_in: r.checkedIn ?? r.checked_in ?? 0,
    remaining: r.remaining ?? 0,
  }
}

/** A group confirm. `tickets` is only what THIS call admitted, not the party. */
export function mapGroupConfirm(r) {
  if (!r) return null
  return {
    admitted: r.admitted ?? false,
    admitted_count: r.admittedCount ?? r.admitted_count ?? 0,
    outcome: r.outcome,
    message: r.message,
    booking: mapParty(r.booking),
    tickets: (r.tickets || []).map((t) => ({
      ticket_id: t.ticketId ?? t.ticket_id,
      tier_name: t.tierName ?? t.tier_name,
      seat_location: t.seatLocation ?? t.seat_location ?? null,
      unit_seq: t.unitSeq ?? t.unit_seq,
    })),
    total: r.total ?? 0,
    remaining: r.remaining ?? 0,
  }
}

/** A venue, as the organiser's forms read it. */
/** Kept beside mapEvent: the two image slots the API returns. */
export function eventImages(e) {
  return {
    cover_image_url: e?.coverImageUrl ?? e?.cover_image_url ?? null,
    banner_image_url: e?.bannerImageUrl ?? e?.banner_image_url ?? null,
  }
}

export function mapVenue(v) {
  if (!v) return null
  return {
    id: v.id,
    organizer_id: v.organizerId ?? v.organizer_id,
    name_en: v.nameEn ?? v.name_en,
    name_km: v.nameKm ?? v.name_km,
    province_code: v.provinceCode ?? v.province_code,
    khan_district: v.khanDistrict ?? v.khan_district,
    sangkat_commune: v.sangkatCommune ?? v.sangkat_commune,
    street_address: v.streetAddress ?? v.street_address,
    is_disabled: v.isDisabled ?? v.is_disabled ?? false,
  }
}
