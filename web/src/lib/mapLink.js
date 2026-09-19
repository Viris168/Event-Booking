/**
 * Pulling a venue's coordinates out of a Google Maps link.
 *
 * Why this exists
 * ---------------
 * The venue form used to ask for latitude and longitude as two bare number
 * inputs, marked optional. Nobody knows their building's decimal degrees, so
 * nobody filled them in: nine of the ten venues in production carry a null
 * pin, which is why a map of the catalogue would plot a single marker.
 *
 * Pasting a Maps link is something an organiser can actually do, and the
 * coordinates are already sitting in the URL - no geocoder, no API key, no
 * model. This module reads them out.
 *
 * What the URLs look like
 * -----------------------
 * Two shapes reach us, and only one of them can be read here:
 *
 *   1. A full URL, from the desktop address bar or resolved from a short link.
 *      Coordinates are inside it; `coordsFromMapsUrl` handles it offline.
 *
 *   2. https://maps.app.goo.gl/<code> - what the phone's Share button produces.
 *      It carries no coordinates at all, only an opaque code, and resolving it
 *      means following a redirect. The browser cannot read a cross-origin
 *      redirect target, so that hop belongs to the server; `isShortMapLink`
 *      is how the form decides to ask for it.
 */

/** Cambodia's bounding box, generously rounded. */
const BOUNDS = { minLat: 10, maxLat: 15, minLng: 102, maxLng: 108 }

/**
 * How far a pin may sit from the map's camera centre before we stop believing
 * it belongs to the place in the URL. See `coordsFromMapsUrl` for what this
 * actually defends against; 5km is far wider than any real venue-to-viewport
 * gap and far narrower than the cross-city errors it catches.
 */
const MAX_PIN_TO_VIEWPORT_M = 5000

const EARTH_RADIUS_M = 6371000
const toRad = (deg) => (deg * Math.PI) / 180

/** Metres between two points. Standard haversine. */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Is this pin plausibly in Cambodia?
 *
 * Cheap, and it catches the classic mistake for free: a swapped pair reads as
 * (104.9, 11.6), whose latitude is past the north pole's worth of nonsense and
 * fails immediately. Deliberately loose - this rejects obvious rubbish, it does
 * not verify the organiser picked the right building.
 */
export function inCambodia(c) {
  return (
    !!c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat > BOUNDS.minLat &&
    c.lat < BOUNDS.maxLat &&
    c.lng > BOUNDS.minLng &&
    c.lng < BOUNDS.maxLng
  )
}

/** True for the short share links only the server can resolve. */
export function isShortMapLink(url) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(url || '').trim())
}

/**
 * The coordinates a Maps URL points at, or null.
 *
 * Three sources, and the order is the whole point:
 *
 *   !3d<lat>!4d<lng>  The place's own pin, inside the `data=` blob. Precise,
 *                     and what we want.
 *   @<lat>,<lng>,<z>  The camera centre. Close to the pin when the link was
 *                     made at a tight zoom, and not otherwise - a real link
 *                     copied at 15z sat 586m from its own venue.
 *   ?q= / ?ll= / …    Older and hand-written forms, where the coordinate IS
 *                     the query.
 *
 * The subtlety is that `!3d/!4d` can appear more than once. A URL copied from
 * the address bar keeps the places you looked at BEFORE this one, and the
 * current place is appended last - so taking the first match returns whatever
 * you happened to search previously. A real link from this project's own
 * testing held two pins 9.5km apart, and the stale one came first.
 *
 * Hence: last pin wins, and it is then checked against the camera. The camera
 * always follows the place you actually opened, so a stale pin betrays itself
 * by being kilometres from it. When that check fails the camera is the better
 * answer - a few hundred metres off beats a confident wrong building.
 */
export function coordsFromMapsUrl(url) {
  const text = String(url || '')

  const viewMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  const viewport = viewMatch ? { lat: +viewMatch[1], lng: +viewMatch[2] } : null

  const pins = [...text.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)]
  if (pins.length) {
    const last = pins[pins.length - 1]
    const pin = { lat: +last[1], lng: +last[2] }
    if (!viewport || distanceMeters(pin, viewport) <= MAX_PIN_TO_VIEWPORT_M) {
      return { ...pin, source: 'pin' }
    }
  }

  if (viewport) return { ...viewport, source: 'viewport' }

  const q = text.match(/[?&](?:q|ll|daddr|saddr|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (q) return { lat: +q[1], lng: +q[2], source: 'query' }

  return null
}

/**
 * The place name Google put in the path, or null.
 *
 * Offered to the form as a suggestion and never written over anything: the
 * organiser's own name_en / name_km are required fields they have already
 * filled, and they know what the building is called locally better than a URL
 * slug does. Reverse geocoding the same point returns the nearest mapped
 * feature, which in testing was a restaurant six metres from the venue - so
 * neither source is trustworthy enough to overwrite a human.
 */
export function placeNameFromMapsUrl(url) {
  const m = String(url || '').match(/\/place\/([^/@?]+)/)
  if (!m) return null
  try {
    // Google slips a zero-width space into some names; strip it or it travels
    // invisibly into the database and breaks later equality checks.
    return decodeURIComponent(m[1]).replace(/\+/g, ' ').replace(/\u200B/g, '').trim() || null
  } catch {
    return null
  }
}

/**
 * One call for the form: what a pasted string yields, and why it failed.
 *
 * Returns { ok: true, coords } | { ok: false, reason }, where reason is
 * 'empty' | 'short-link' | 'unparsed' | 'out-of-bounds'. The form maps those
 * to copy; 'short-link' is not an error but an instruction to ask the server.
 */
export function readMapLink(url) {
  const text = String(url || '').trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (isShortMapLink(text)) return { ok: false, reason: 'short-link' }

  const coords = coordsFromMapsUrl(text)
  if (!coords) return { ok: false, reason: 'unparsed' }
  if (!inCambodia(coords)) return { ok: false, reason: 'out-of-bounds', coords }

  return { ok: true, coords, placeName: placeNameFromMapsUrl(text) }
}
