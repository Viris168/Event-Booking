/**
 * Turn-by-turn directions to a venue, handed off to Google Maps.
 *
 * The destination is always the venue's stored pin (lat/lng), never its name or
 * address: a name search can land on a different branch or a same-named shop,
 * while the pin is the exact spot the organiser confirmed on the venue form.
 *
 * The origin is the viewer's own position when the browser will give it. When
 * it won't (permission denied, no GPS fix, insecure origin), we still open the
 * route with the destination only - Google Maps then fills the start itself
 * from the phone's location, or asks for one on desktop.
 *
 * A fix the browser itself rates as rough is treated the same as no fix. A
 * laptop has no GPS, so its position is guessed from Wi-Fi or the IP address
 * and can be kilometres off; baked into the URL, that guess becomes a route
 * from a street the viewer has never stood on. Better to leave the start to
 * Maps, which on a phone reads real GPS and on desktop lets them type it.
 */

/** Worst accuracy (metres, the browser's own radius) we still route from. */
export const PRECISE_ENOUGH_M = 500;

/**
 * Asking again within this window reuses the last fix instead of re-prompting
 * GPS. Kept short: someone on a tuk-tuk to the venue has moved on in minutes.
 */
const MAX_POSITION_AGE_MS = 60 * 1000;
/** Long enough for a cold GPS fix indoors, short enough that a click still feels like a click. */
const POSITION_TIMEOUT_MS = 10 * 1000;

/** A Google Maps directions URL. `origin` is optional. */
export function directionsUrl(dest, origin) {
  const params = new URLSearchParams({
    api: "1",
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving",
  });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * The viewer's position, or a reason it isn't available.
 * Resolves `{ coords, accuracy }` or
 * `{ error: "unsupported" | "denied" | "unavailable" }`;
 * it never rejects, because every failure has the same fallback.
 */
export function currentPosition() {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      resolve({ error: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
        }),
      (err) =>
        resolve({
          error: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      {
        enableHighAccuracy: true,
        timeout: POSITION_TIMEOUT_MS,
        maximumAge: MAX_POSITION_AGE_MS,
      },
    );
  });
}

/**
 * Open a URL in a new tab after an async step.
 *
 * By the time the location prompt is answered the click's user activation may
 * have expired, and the popup blocker eats the new tab. When that happens we
 * navigate this tab instead: on a phone that hands straight off to the Maps
 * app, and Back returns to the event.
 */
export function openExternal(url) {
  const win = window.open(url, "_blank");
  if (win) {
    // Not passed as a window feature: "noopener" makes window.open return null,
    // which would hide whether the popup was blocked.
    try {
      win.opener = null;
    } catch {
      /* cross-origin already - nothing to sever */
    }
    return;
  }
  window.location.assign(url);
}
