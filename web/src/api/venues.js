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
  client
    .post(`/venue/${venueId}/seats`, { venue_id: Number(venueId), seats })
    .then((r) => r.data)

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
 * `startY` places a new section BELOW whatever is already there. Without it
 * every section is generated at the same origin and they stack on top of each
 * other in the preview — one blob, nothing selectable.
 */
export function generateSeatGrid({ sectionLabel, rows, cols, startY = 0 }) {
  const seats = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      seats.push({
        section_label: sectionLabel,
        row_label: String.fromCharCode(65 + r),
        seat_number: String(c + 1),
        pos_x: (c + 1) * SEAT_PITCH,
        pos_y: startY + r * SEAT_PITCH,
      })
    }
  }
  return seats
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
