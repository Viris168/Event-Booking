import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * The pin, shown back so the organiser can confirm or correct it.
 *
 * This is the step that makes the whole map-link flow safe. Every way of
 * deriving a coordinate from a pasted URL can be confidently wrong - a stale
 * pin left in the URL by a previous search, a camera centre half a kilometre
 * from the venue, a swapped pair that happens to land in bounds. None of those
 * are visible in a decimal, and all of them are obvious on a map. Reading the
 * link without showing the result would just be a faster way to store a wrong
 * building.
 *
 * Dragging the marker is the correction path, and the only one for a venue
 * Google has never heard of.
 *
 * Matches the marker language of the places map in the older BookingME
 * project: a plain circle via divIcon, white ring, soft shadow. The flight
 * behaviour there (the two-stage zoom-out for a long hop) belongs to a map
 * showing many places at once, not to a single static pin.
 */

const ZOOM = 16
const IDLE = '#888'
const ACTIVE = '#1a73e8'

function pinIcon(active = true) {
  const size = active ? 18 : 14
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${active ? ACTIVE : IDLE};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function VenuePinPreview({ lat, lng, onMove, locale = 'en' }) {
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  // Held in a ref so moving the pin does not need the effect to re-subscribe;
  // the dragend handler is created once and always calls the current callback.
  // Written in an effect rather than during render - a ref assignment in the
  // render body runs on every pass, including ones React throws away.
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const km = locale === 'km'

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return

    const map = L.map(hostRef.current, {
      // A map inside a form is a detail to check, not a surface to explore.
      // Scroll-zoom here would swallow the page scroll on the way past it.
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lng], ZOOM)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    const marker = L.marker([lat, lng], { icon: pinIcon(true), draggable: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      onMoveRef.current?.({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })
    })

    mapRef.current = map
    markerRef.current = marker

    // The map is measured on creation, and here it is created inside a panel
    // that was hidden a moment earlier - without this it lays out against a
    // zero height and renders one grey tile.
    const t = setTimeout(() => map.invalidateSize(), 0)

    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Deliberately once: later coordinates are pushed in by the effect below
    // rather than by tearing the map down and rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A newly pasted link moves the existing pin instead of remounting the map.
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) return
    const next = L.latLng(lat, lng)
    if (marker.getLatLng().equals(next)) return
    marker.setLatLng(next)
    map.setView(next, Math.max(map.getZoom(), ZOOM))
  }, [lat, lng])

  return (
    <div className="stack-sm">
      <div ref={hostRef} className="pin-preview" />
      <p className="hint">
        {km
          ? 'អូសចំណុចដើម្បីកែទីតាំង។'
          : 'Drag the pin if it is not exactly on the venue.'}{' '}
        <b>
          {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
        </b>
      </p>
    </div>
  )
}
