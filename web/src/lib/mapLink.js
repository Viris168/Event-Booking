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
const BOUNDS = { minLat: 10, maxLat: 15, minLng: 102, maxLng: 108 };

/**
 * How far a pin may sit from the map's camera centre before we stop believing
 * it belongs to the place in the URL. See `coordsFromMapsUrl` for what this
 * actually defends against; 5km is far wider than any real venue-to-viewport
 * gap and far narrower than the cross-city errors it catches.
 */
const MAX_PIN_TO_VIEWPORT_M = 5000;

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Metres between two points. Standard haversine. */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
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
  );
}

/** Clean raw user input by extracting URL from iframes, mobile share text, or raw coordinates. */
export function cleanMapsInput(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  // 1. If an iframe snippet was pasted: <iframe src="https://..." ...>
  const iframeMatch = text.match(/src=["'](https?:\/\/[^"']+)["']/i);
  if (iframeMatch) return iframeMatch[1];

  // 2. If a URL is embedded in surrounding text (e.g. mobile share: "Koh Pich https://maps.app.goo.gl/...")
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) return urlMatch[0];

  return text;
}

/** True for the short share links only the server can resolve. */
export function isShortMapLink(url) {
  const clean = cleanMapsInput(url);
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(clean);
}

/**
 * The coordinates a Maps URL points at, or null.
 *
 * Handles:
 *   1. Raw decimal coordinates ("11.5471, 104.9388")
 *   2. !3d<lat>!4d<lng> (pin in standard Maps URLs)
 *   3. !2d<lng>!3d<lat> (pin in embed PB URLs)
 *   4. @<lat>,<lng> (viewport center)
 *   5. ?q= / ?query= / ?ll= / ?center= (query coordinates)
 */
export function coordsFromMapsUrl(url) {
  const clean = cleanMapsInput(url);
  let text = clean;
  try {
    text = decodeURIComponent(clean);
  } catch {
    // Keep original if decoding fails
  }

  // 1. Raw coordinates "11.547141, 104.938821"
  const rawCoord = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (rawCoord) {
    return { lat: +rawCoord[1], lng: +rawCoord[2], source: "raw" };
  }

  const viewMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const viewport = viewMatch
    ? { lat: +viewMatch[1], lng: +viewMatch[2] }
    : null;

  // 2. Standard pin !3d<lat>!4d<lng>
  const pins = [...text.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (pins.length) {
    const last = pins[pins.length - 1];
    const pin = { lat: +last[1], lng: +last[2] };
    if (!viewport || distanceMeters(pin, viewport) <= MAX_PIN_TO_VIEWPORT_M) {
      return { ...pin, source: "pin" };
    }
  }

  // 3. Embed PB pin !2d<lng>!3d<lat>
  const embedPins = [
    ...text.matchAll(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/g),
  ];
  if (embedPins.length) {
    const last = embedPins[embedPins.length - 1];
    return { lat: +last[2], lng: +last[1], source: "embed-pin" };
  }

  // 4. Query params ?q=lat,lng or ?query=lat,lng or ?ll=lat,lng
  const q = text.match(
    /[?&](?:q|query|ll|daddr|saddr|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
  );
  if (q) return { lat: +q[1], lng: +q[2], source: "query" };

  if (viewport) return { ...viewport, source: "viewport" };

  return null;
}

/**
 * The place name Google put in the path, or null.
 */
export function placeNameFromMapsUrl(url) {
  const clean = cleanMapsInput(url);
  const m = String(clean || "").match(/\/place\/([^/@?]+)/);
  if (!m) return null;
  try {
    return (
      decodeURIComponent(m[1])
        .replace(/\+/g, " ")
        .replace(/\u200B/g, "")
        .trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * One call for the form: what a pasted string yields, and why it failed.
 */
export function readMapLink(url) {
  const clean = cleanMapsInput(url);
  if (!clean) return { ok: false, reason: "empty" };
  if (isShortMapLink(clean))
    return { ok: false, reason: "short-link", url: clean };

  const coords = coordsFromMapsUrl(clean);
  if (!coords) return { ok: false, reason: "unparsed" };
  if (!inCambodia(coords))
    return { ok: false, reason: "out-of-bounds", coords };

  return {
    ok: true,
    coords,
    placeName: placeNameFromMapsUrl(clean),
    url: clean,
  };
}
