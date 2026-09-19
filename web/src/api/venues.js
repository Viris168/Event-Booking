import client from './client.js'

/**
 * Venues and their physical seat maps.
 *
 * A venue is a building. Its seats (`venue_seat`) belong to it, not to any
 * event, and every show held there points at the same rows — which is why the
 * seat-map calls live here and not under an event.
 */

export const getVenues = (params) => client.get('/venue', { params }).then((r) => r.data)

export const getVenue = (id) => client.get(`/venue/${id}`).then((r) => r.data)

export const createVenue = (data) => client.post('/venue', data).then((r) => r.data)

export const updateVenue = (id, data) => client.patch(`/venue/${id}`, data).then((r) => r.data)

/**
 * Where a Google Maps short link points.
 *
 * Only needed for the `maps.app.goo.gl` form the phone's Share button
 * produces: those carry no coordinates, and the redirect that reveals them is
 * unreadable from a browser. A full Maps URL is parsed locally by
 * lib/mapLink.js without a round trip, so check `isShortMapLink` first.
 */
export const resolveMapLink = (url) =>
  client.post('/venue/resolve-map-link', { url }).then((r) => r.data.resolvedUrl)

/** The building's seat map. Shared by every event held there. */
export const getVenueSeatMap = (venueId) =>
  client.get(`/venue/${venueId}/seats`).then((r) => r.data)

/**
 * Add seats to a venue.
 *
 * Takes explicit rows rather than a rows×columns shape: a real room is not
 * always a grid, and the client is the side that knows the layout it drew.
 * `generateSeatGrid` below turns the common case into that shape.
 */
export const createVenueSeats = (venueId, seats) =>
  client.post(`/venue/${venueId}/seats`, { seats }).then((r) => r.data)

/**
 * Remove one section from a venue's map.
 *
 * Refused with 409 when any event has laid seats over that section — those
 * `event_seat` rows point at these ids and tickets reach back through them, so
 * the server names the events rather than cascading into a sold seat. The
 * narrow case it does allow is the common one: a section generated wrong,
 * deleted before anything uses it.
 *
 * Resolves with the REMAINING map, so the caller redraws from the server
 * instead of guessing what is left.
 */
export const deleteVenueSeatSection = (venueId, sectionLabel) =>
  client
    .delete(`/venue/${venueId}/seats`, { params: { section: sectionLabel } })
    .then((r) => r.data)

/** Row letters are A–Z; nothing in the schema forbids 'AA', but nothing reads it either. */
export const MAX_ROWS = 26

/** The spacing every seat map in this database already uses. */
export const SEAT_PITCH = 30

/**
 * The rectangular block the editor offers: rows A.. and seats 1..n.
 *
 * <b>Coordinates are in the same units the existing data uses</b> — a 30-unit
 * pitch, x starting at one pitch in. An earlier version wrote plain grid indices
 * (0, 1, 2…) on the reasoning that the renderer should decide the scale; that
 * reasoning is fine in the abstract and wrong here, because every seeded venue
 * already holds 30-unit coordinates and the preview reads them directly. Two
 * scales in one venue is a map that cannot be drawn.
 *
 * `startY` places a new block BELOW whatever is already there. Without it
 * every section is generated at the same origin and they stack on top of each
 * other in the preview — one blob, nothing selectable.
 *
 * `seatsPerRow` takes a number for the rectangular case, or ONE COUNT PER ROW
 * for a room that is not a rectangle — a VIP block of 12 then 14 is two numbers,
 * not two sections. The server has always accepted this shape; only this
 * function insisted on a grid.
 *
 * `startRow` is what lets a second call extend a section that already exists
 * rather than colliding with its row A.
 */
export function generateSeatGrid({ sectionLabel, seatsPerRow, rows, startY = 0, startRow = 'A' }) {
  const start = parseStartRow(startRow)
  // Refuse rather than write nonsense. The previous version did charCode
  // arithmetic on whatever it was handed, so a start row of '9' ran off the end
  // of the numerals and produced rows named ':', ';', '<', '=' - straight into
  // the database, where a seat map is expensive to correct because it is shared
  // by every event at the venue.
  if (!start) throw new Error(`Start row must be a letter A-Z or a number: got "${startRow}"`)

  const counts = Array.isArray(seatsPerRow)
    ? seatsPerRow
    : Array.from({ length: Number(rows) || 0 }, () => Number(seatsPerRow))

  const seats = []
  counts.forEach((count, r) => {
    const rowLabel = rowLabelAt(start, r)
    if (rowLabel == null) throw new Error('Rows run past Z')
    for (let c = 0; c < Number(count); c += 1) {
      seats.push({
        section_label: sectionLabel,
        row_label: rowLabel,
        seat_number: String(c + 1),
        pos_x: (c + 1) * SEAT_PITCH,
        pos_y: startY + r * SEAT_PITCH,
      })
    }
  })
  return seats
}

/**
 * Where a block of rows starts, and in which of the two systems.
 *
 * A house names its rows with letters or with numbers - both are ordinary, and
 * the venues in this database already hold each. Returns null for anything
 * else, so the caller can refuse instead of inventing a label.
 */
export function parseStartRow(value) {
  const raw = String(value ?? '').trim()
  if (/^[A-Za-z]$/.test(raw)) return { kind: 'alpha', from: raw.toUpperCase().charCodeAt(0) - 65 }
  if (/^\d{1,3}$/.test(raw)) return { kind: 'numeric', from: Number(raw) }
  return null
}

/** The label `index` rows after a parsed start. null once letters pass Z. */
export function rowLabelAt(start, index) {
  if (start.kind === 'numeric') return String(start.from + index)
  const i = start.from + index
  return i < MAX_ROWS ? String.fromCharCode(65 + i) : null
}

/**
 * '12' → [12]; '12, 14, 14' → [12, 14, 14].
 *
 * Returns null for anything that is not a list of positive whole numbers, so the
 * caller can say WHICH field is wrong rather than generating a half-empty block.
 */
export function parseSeatCounts(value) {
  const parts = String(value).split(',').map((x) => x.trim()).filter((x) => x !== '')
  if (!parts.length) return null
  const counts = parts.map(Number)
  if (counts.some((n) => !Number.isInteger(n) || n < 1 || n > 40)) return null
  return counts
}

/**
 * The provinces a venue may sit in.
 *
 * Fetched, never hardcoded. The app used to carry its own two-letter list
 * ('PP', 'SR', 'BB'…) that matched nothing in `province_ref` — and since
 * `venue.province_code` is a foreign key, every venue outside the two seeded
 * provinces failed to save with an error nobody could act on.
 */
export const getProvinces = () => client.get('/province').then((r) => r.data)

/**
 * Retire a venue.
 *
 * A **soft** delete: the server sets `is_disabled` and keeps every row, so
 * events already held there keep working and their tickets stay valid. It then
 * drops out of `GET /venue`, which is what removes it from the event form's
 * picker.
 *
 * Nothing hard-deletes a venue, and nothing should: `event.venue_id` points at
 * it, `venue_seat` hangs off it, and sold tickets reach back through both.
 */
export const disableVenue = (id) => client.delete(`/venue/${id}`).then((r) => r.data)
