import { useCallback, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usd } from '../lib/format.js'
import { plottable } from '../lib/eventGeo.js'
import { minPriceCents } from '../lib/eventPrice.js'
import { useProvinces } from '../lib/useProvinces.js'
import { useTheme } from '../context/ThemeContext.jsx'

/**
 * The catalogue map: one marker per event on the page.
 *
 * Plots what the list is already showing rather than filtering by what the map
 * can see. Search-as-you-move would need a bounding-box parameter the events
 * endpoint does not have, and at this catalogue's size it would only ever hide
 * rows the visitor could see by scrolling.
 *
 * The flight behaviour is carried over from the places map in the older
 * BookingME project - a long hop climbs to a cruising altitude, holds there,
 * then dives into the destination, which is what makes Phnom Penh to Siem Reap
 * read as a jump rather than a slide. A single-arc version of this (Leaflet's
 * own flyTo interpolation) was tried in between and read as too smooth to
 * register as travel - the climb-hold-dive shape is the part that was missing.
 * The cancellation token guards the handoff between the two legs, because
 * changing selection mid-climb otherwise leaves two flights fighting or a dive
 * firing for a hop nobody is waiting on any more.
 */

/** Where a flight lands. Close enough that arriving somewhere means something. */
const ARRIVAL_ZOOM = 16

/**
 * A flight is never snappier than this, nor more self-indulgent than that.
 *
 * The floor is what a short hop gets, and short is the common case here - two
 * events at the same venue are zero metres apart, so without a generous floor
 * the "flight" is over before the eye finds it. The ceiling was 3.2s, which
 * this catalogue's longest real hop (fafda to Grand Royal Golf, 233km) hit
 * outright - so the single biggest jump available got the same rushed
 * treatment as a mid-size one. Raised, and the distance formula below now
 * reaches further before flattening out against it.
 */
const MIN_FLIGHT_S = 0.8
const MAX_FLIGHT_S = 1.8

/**
 * How long the camera holds at cruise altitude before diving in.
 *
 * Without this the dive fired the instant the climb's `moveend` landed, so
 * the two legs ran together as one motion rather than reading as climb, then
 * a beat, then descent - the pause is what makes it a JUMP instead of a
 * fast pan that happens to bulge upward in the middle.
 */
const CRUISE_HOLD_MS = 100

/**
 * How long a card has to stay hovered before the map goes anywhere.
 *
 * Without it, running the pointer down the list fires a flight per card
 * crossed, and each one cancels the last - so no animation ever plays and the
 * map reads as snapping between pins. Long enough to absorb a pointer passing
 * through, short enough that a deliberate hover feels answered.
 */
const HOVER_SETTLE_MS = 200

/**
 * The altitude a long hop climbs to before diving into its destination.
 *
 * This is what makes the motion read as a JUMP rather than a slide: the
 * camera visibly pulls back until the whole gap between start and finish
 * would fit on screen, holds there for a beat, then drops into the target.
 * Two legs, not one continuous interpolation.
 */
const CRUISE_ZOOM = 8

/** Below this distance a climb reads as fidgeting, not travel - just ease in. */
const CLIMB_THRESHOLD_M = 5000

/*
 * The basemap, one cut per theme.
 *
 * OSM publishes a single raster style and it is a bright one, so dark mode was
 * reaching it through a CSS invert of the tile pane - which turns green land
 * muddy brown, leaves roads grey on grey, and makes the labels legible only if
 * you already know what they say. Esri serves a light and a dark cartography
 * keyless, so each theme now gets tiles that were drawn for it.
 *
 * The light one is the street map rather than the matching light canvas: the
 * canvas draws white roads on near-white land, which at the country zoom this
 * page opens at reads as an empty page. The dark canvas has the contrast the
 * light one lacks, and ships its labels as a separate overlay - hence the
 * optional second layer.
 *
 * (CARTO's Voyager/dark_all pair was tried first and now answers with an
 * API-KEY-REQUIRED watermark baked into the tile.)
 */
const TILES = {
  light: {
    base: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    labels: null,
    maxNativeZoom: 19,
  },
  dark: {
    base: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    labels: null,
    maxNativeZoom: 19,
  },
}
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** The whole country, for when nothing narrower is selected. */
const CAMBODIA = { center: [12.5657, 104.991], zoom: 7 }

/**
 * A price pill, not a dot.
 *
 * The dot came from the older BookingME places map, where every marker was the
 * same kind of thing and the list beside it carried the prices. On a catalogue
 * the price IS the reason to look at one pin over another, so it belongs on
 * the pin - which is what makes a map like this scannable without hovering
 * every marker in turn.
 *
 * Sized by its own text rather than a fixed box, so "$0.10" and "$130.00" both
 * sit centred over the venue. iconSize is left null and the anchor handled in
 * CSS with a translate, because the width is not known until it renders.
 */
function priceIcon({ label, active }) {
  return L.divIcon({
    className: 'evmap-pin-wrap',
    html: `<span class="evmap-pin${active ? ' is-active' : ''}">${escapeHtml(label)}</span>`,
    iconSize: null,
    popupAnchor: [0, -18],
  })
}



export default function EventsMap({ events, activeId, onSelect, locale = 'en' }) {
  const { provinceName } = useProvinces()
  const { isDark } = useTheme()
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const flightRef = useRef(0)
  // The setTimeout standing in for the hold at cruise altitude, so a flight
  // that gets superseded mid-hold can cancel its own pending dive outright
  // rather than relying only on the token check to no-op it later.
  const holdTimerRef = useRef(null)
  // The one `moveend` listener a climb registers, kept so it can be taken off
  // by name. See the comment in flyTo for why it cannot be taken off wholesale.
  const climbEndRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const points = useMemo(() => plottable(events), [events])
  // The observer below is created once and outlives any particular result set,
  // so it reads the current points through a ref rather than closing over them.
  const pointsRef = useRef(points)
  useEffect(() => {
    pointsRef.current = points
  }, [points])
  const framedRef = useRef(false)

  /**
   * The two-stage flight.
   *
   * A short hop is one animation. A long one pulls out to zoom 8 first and
   * only then comes in, so the country is visible in between instead of the
   * viewport tearing across it at street level. `map.stop()` kills whatever
   * was in flight; the token makes a superseded flight abandon its own
   * second leg rather than landing on top of the newer one.
   */
  const flyTo = useCallback((center, targetZoom = ARRIVAL_ZOOM) => {
    const map = mapRef.current
    if (!map) return
    const token = ++flightRef.current
    const to = L.latLng(center)
    const from = map.getCenter()
    /*
     * A map that has never had a size has no centre worth interpolating from -
     * fitBounds on a zero-height container leaves the view at (NaN, NaN), and
     * every flight after that threw "Invalid LatLng" out of an effect, which
     * took the whole page down with it. Land directly instead; the observer
     * below re-frames once a real size arrives.
     */
    if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) {
      map.setView(to, targetZoom, { animate: false })
      return
    }
    const metres = map.distance(from, to)

    /*
     * Duration scales with distance, so a hop across Phnom Penh and one to
     * Siem Reap are the same gesture at different lengths rather than the
     * same fixed number regardless of how far there is to go.
     */
    const seconds = Math.min(
      MAX_FLIGHT_S,
      Math.max(MIN_FLIGHT_S, MIN_FLIGHT_S + Math.log10(1 + metres / 1000) * 0.95),
    )

    map.stop()
    /*
     * Only THIS component's pending climb handler comes off, by reference.
     *
     * It used to be a bare `map.off('moveend')`, which is not "nothing else
     * listens, so this is safe" - Leaflet's own GridLayer binds `moveend` to
     * refresh and prune its tiles, and clearing the event wholesale unbound
     * the tile layers for the life of the map. The symptom was a low-zoom tile
     * left stretched across the map after the first flight, which with labels
     * over it reads as half a province name in 200px letters.
     */
    if (climbEndRef.current) {
      map.off('moveend', climbEndRef.current)
      climbEndRef.current = null
    }
    clearTimeout(holdTimerRef.current)
    if (token !== flightRef.current) return

    /*
     * Short hops ease straight in - one leg, the same as before. A climb over
     * a few hundred metres would look like the map flinching rather than
     * travelling, since there is nowhere for the pull-back to go.
     */
    const alreadyLow = map.getZoom() <= CRUISE_ZOOM
    if (metres <= CLIMB_THRESHOLD_M || alreadyLow) {
      map.flyTo(to, targetZoom, { animate: true, duration: seconds, easeLinearity: 0.1 })
      return
    }

    /*
     * The jump: climb to cruise altitude over the midpoint, hang there, then
     * dive into the destination. Two flyTo calls chained through `moveend`
     * rather than Leaflet's own single-interpolation arc, because a jump is a
     * different gesture from a slide - the pause at altitude is the part that
     * reads as travel, and one continuous curve never holds still long enough
     * to register.
     *
     * The token guards the handoff: if a newer selection starts mid-climb, its
     * own flyTo call reaches the map.stop() and the climb-handler teardown
     * above before this one's climb would otherwise complete, so the dive leg
     * below never fires for a flight nobody is waiting on any more.
     */
    const mid = L.latLng((from.lat + to.lat) / 2, (from.lng + to.lng) / 2)
    const climbSeconds = seconds * 0.42
    const diveSeconds = seconds * 0.58

    map.flyTo(mid, CRUISE_ZOOM, { animate: true, duration: climbSeconds, easeLinearity: 0.2 })
    const onClimbEnd = () => {
      climbEndRef.current = null
      if (token !== flightRef.current) return
      // The hang: the climb has landed at altitude, and the dive waits here
      // rather than firing on the same tick. Still guarded by the token, since
      // the hold itself is dead time a newer selection can land inside.
      holdTimerRef.current = setTimeout(() => {
        if (token !== flightRef.current) return
        map.flyTo(to, targetZoom, { animate: true, duration: diveSeconds, easeLinearity: 0.1 })
      }, CRUISE_HOLD_MS)
    }
    climbEndRef.current = onClimbEnd
    map.once('moveend', onClimbEnd)
    // Reaches nothing but refs, so it never needs to be rebuilt - which is what
    // lets the effects below depend on it without re-running every render.
  }, [])

  /**
   * Put the whole result set in view: bounds for several, a flight for one.
   *
   * Answers whether it actually framed anything, so a caller waiting for the
   * first real framing can tell "done" from "nothing to draw yet".
   */
  const frame = useCallback((list) => {
    const map = mapRef.current
    if (!map || !list?.length) return false
    // Same reason as the guard in flyTo: framing against a container that has
    // not been measured yet produces a NaN view rather than a wrong one.
    const size = map.getSize()
    if (!size.x || !size.y) return false
    if (list.length > 1) {
      map.fitBounds(L.latLngBounds(list.map((e) => [+e.venue.lat, +e.venue.lng])), {
        padding: [40, 40],
        maxZoom: 16,
      })
    } else {
      flyTo([+list[0].venue.lat, +list[0].venue.lng], 16)
    }
    return true
  }, [flyTo])

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return
    const map = L.map(hostRef.current, { zoomControl: true, scrollWheelZoom: true })
      .setView(CAMBODIA.center, CAMBODIA.zoom)
    mapRef.current = map

    /*
     * Leaflet measures its container once, at creation, and this one is
     * created inside a column that is display:none on a phone until the Map
     * button is pressed. Measured at zero it draws a single tile and never
     * recovers on its own.
     *
     * A ResizeObserver rather than a timeout: the size arrives when the
     * visitor reveals the column, which is not a moment any delay can be
     * tuned to. It also covers the window being resized and the pane being
     * revealed by a media query, both of which a one-shot timer misses.
     */
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return
      map.invalidateSize()
      /*
       * Re-frame the first time a real size arrives.
       *
       * invalidateSize alone is not enough: markers added while the container
       * measured zero were framed against that, so the map pane ends up
       * translated by half the container and the content sits in a corner with
       * blank space beside it. Only the FIRST valid measurement re-frames -
       * doing it on every resize would yank the map back from wherever the
       * visitor had panned to.
       */
      /*
       * Marked done only if it framed. Setting the flag regardless meant a
       * size arriving before the first result set burned the one re-frame on
       * an empty list, and the map then sat wherever the zero-size layout had
       * left it - Cambodia shoved off the right-hand edge - for good.
       */
      if (!framedRef.current && frame(pointsRef.current)) framedRef.current = true
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current = {}
    }
    // `frame` is a useCallback over `flyTo`, which closes over refs only - both
    // are stable for the life of the component, so listing it here satisfies
    // the linter without ever tearing the map down and rebuilding it.
  }, [frame])

  /*
   * Day and night on the same map.
   *
   * The layers are replaced rather than re-pointed, because the two cuts do
   * not have the same shape - one carries its labels, the other keeps them in
   * a second layer, and they run out of tiles at different zooms. Only the
   * tile layers go: the map itself, the view the visitor had panned to and
   * every marker on it are untouched, so switching theme does not lose their
   * place.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const tiles = isDark ? TILES.dark : TILES.light
    const shared = { maxZoom: 19, maxNativeZoom: tiles.maxNativeZoom }
    // Explicit zIndex rather than trusting the order they were added: the
    // labels have to stay over the land whatever else joins the tile pane.
    const layers = [
      L.tileLayer(tiles.base, { ...shared, attribution: TILE_ATTRIBUTION, zIndex: 1 }),
    ]
    if (tiles.labels) layers.push(L.tileLayer(tiles.labels, { ...shared, zIndex: 2 }))
    layers.forEach((layer) => layer.addTo(map))
    return () => layers.forEach((layer) => layer.remove())
  }, [isDark])

  // Markers follow the page: rebuilt when the result set changes, which is
  // cheaper to reason about than diffing and never leaves a pin for an event
  // that has scrolled out of the results.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const mine = {}
    points.forEach((e) => {
      const title = locale === 'km' ? (e.title_km ?? e.titleKm) : (e.title_en ?? e.titleEn)
      const venue = e.venue
      const vName = locale === 'km'
        ? (venue.name_km ?? venue.nameKm)
        : (venue.name_en ?? venue.nameEn)
      const from = minPriceCents(e)
      const label = from == null ? (locale === 'km' ? 'មើល' : 'View') : usd(from)
      const province = provinceName(venue.provinceCode ?? venue.province_code, locale)

      // Plenty of events are named after the place they happen at, and the
      // popup was printing that name twice - once bold, once grey beneath it.
      // Drop the venue line when it says nothing the title has not.
      const sameName = (title ?? '').trim().toLowerCase() === (vName ?? '').trim().toLowerCase()

      const vParts = []
      if (!sameName && vName) vParts.push(vName)
      if (province) vParts.push(province)
      const venueHtml = vParts.length > 0 ? `<div class="evmap-pop-venue">${escapeHtml(vParts.join(' · '))}</div>` : ''

      const marker = L.marker([+venue.lat, +venue.lng], { icon: priceIcon({ label, active: false }) })
        .addTo(map)
        .bindPopup(
          `<div class="evmap-pop">
             <div class="evmap-pop-title">${escapeHtml(title ?? '')}</div>
             ${venueHtml}
             ${from == null ? '' : `<div class="evmap-pop-price">${usd(from)}</div>`}
           </div>`,
        )
      marker.on('click', () => onSelectRef.current?.(e.id))
      // The icon is rebuilt on selection, and rebuilding it needs the label
      // again - cheaper to carry it than to recompute the price from the event.
      marker.options.priceLabel = label
      mine[e.id] = marker
    })
    markersRef.current = mine

    // Frame the whole result set, unless there is nothing to frame.
    frame(points)

    /*
     * Each run tears down the markers it created, rather than the next run
     * clearing up after the last one.
     *
     * The difference shows under React's development double-invoke: a prelude
     * that empties markersRef loses its only handle on the first pass's
     * markers, which then stay on the map forever. Four events were drawing
     * six pins.
     */
    return () => {
      Object.values(mine).forEach((m) => m.remove())
    }
  }, [points, locale, frame, provinceName])

  // Selection: light up the chosen pin, dim the rest, and go to it.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // The pill lighting up is immediate - that is the answer to "which one is
    // this?", and it should never wait on an animation.
    Object.entries(markersRef.current).forEach(([id, m]) => {
      m.setIcon(priceIcon({ label: m.options.priceLabel, active: String(id) === String(activeId) }))
    })

    const chosen = markersRef.current[activeId]
    if (!chosen) {
      // Nothing selected any more, so nothing should still be labelled. The
      // early return used to skip this: a popup opened on one hover stayed on
      // the map indefinitely, pointing at a card the reader had long left, and
      // with no pin lit to match it.
      map.closePopup()
      return
    }

    // Moving the map does wait. The cleanup cancels a pending flight whenever
    // the selection changes again, so only a hover the visitor actually settled
    // on ever reaches the map.
    const timer = setTimeout(() => {
      chosen.openPopup()

      /*
       * No "already visible, so stay put" shortcut here.
       *
       * It was added to stop the map lurching, and it did - by doing nothing at
       * all for this catalogue, where every pin sits inside the same view. The
       * lurch was the flat slide, not the travelling; now that a flight rises
       * and settles, going somewhere is the thing worth watching.
       */
      flyTo(chosen.getLatLng())
    }, HOVER_SETTLE_MS)

    return () => clearTimeout(timer)
  }, [activeId, flyTo])

  return <div ref={hostRef} className="events-map" />
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}
