import { useState } from 'react'
import Icon from './Icon.jsx'
import { Field } from './ui.jsx'
import { readMapLink, coordsFromMapsUrl, inCambodia } from '../lib/mapLink.js'
import { resolveMapLink } from '../api/venues.js'

/**
 * How a venue gets its map pin.
 *
 * Replaces the two bare "Latitude" / "Longitude" number inputs this form used
 * to carry. Those were marked optional and asked an organiser for decimal
 * degrees, which nobody knows offhand - nine of the ten venues in production
 * were saved with a null pin, which is what a catalogue map would have plotted
 * as a single marker.
 *
 * Pasting a Maps link is something they can actually do, and the coordinates
 * are already in the URL. The two numbers are still here underneath, because a
 * venue with no Google presence has to be placeable by hand.
 *
 * @param {{lat: string, lng: string}} value  Form state, kept as strings so an
 *   empty field stays empty rather than becoming 0.
 * @param {(patch: {lat: string, lng: string}) => void} onChange
 * @param {React.ReactNode} preview  The map that shows the resolved pin back.
 *   Passed in rather than imported so this component stays independent of which
 *   mapping library the project settles on.
 */
export default function MapLinkField({ value, onChange, preview = null, locale = 'en' }) {
  const [link, setLink] = useState('')
  const [status, setStatus] = useState(null) // { tone, text }
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)

  const km = locale === 'km'
  const hasPin = value.lat !== '' && value.lng !== ''

  function apply(coords, note) {
    onChange({ lat: String(coords.lat), lng: String(coords.lng) })
    setStatus({ tone: 'ok', text: note })
  }

  async function read() {
    const text = link.trim()
    if (!text) return

    setBusy(true)
    setStatus(null)
    try {
      // A full URL carries its own coordinates, so it never touches the
      // network. Only the short share link needs the server, and only because
      // a browser cannot read a cross-origin redirect's target.
      let result = readMapLink(text)

      if (!result.ok && result.reason === 'short-link') {
        const resolved = await resolveMapLink(text)
        const coords = coordsFromMapsUrl(resolved)
        if (!coords) {
          setStatus({ tone: 'bad', text: unreadable(km) })
          return
        }
        if (!inCambodia(coords)) {
          setStatus({ tone: 'bad', text: outside(km) })
          return
        }
        apply(coords, found(km, coords))
        return
      }

      if (result.ok) {
        apply(result.coords, found(km, result.coords))
        return
      }

      setStatus({
        tone: 'bad',
        text: result.reason === 'out-of-bounds' ? outside(km) : unreadable(km),
      })
    } catch (err) {
      // The server's own message is the useful one here - it already tells the
      // organiser to use the Share button - so prefer it over a generic string.
      const detail = err?.response?.data?.message || err?.response?.data?.detail
      setStatus({ tone: 'bad', text: detail || unreadable(km) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-sm">
      <Field
        label={km ? 'តំណ Google Maps' : 'Google Maps link'}
        hint={
          km
            ? 'បើកទីកន្លែងក្នុង Google Maps ចុច Share រួចបិទភ្ជាប់តំណនៅទីនេះ'
            : 'Open the venue in Google Maps, tap Share, and paste the link here'
        }
      >
        <div className="row row-tight">
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            // Enter inside a field belonging to a larger form would submit the
            // venue, not read the link.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                read()
              }
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={read}
            disabled={busy || !link.trim()}
          >
            <Icon name={busy ? 'refresh' : 'mapPin'} size={15} />
            {busy ? (km ? 'កំពុងអាន…' : 'Reading…') : km ? 'អាន' : 'Read'}
          </button>
        </div>
      </Field>

      {status && (
        <p className={status.tone === 'ok' ? 'hint' : 'err'}>
          <Icon name={status.tone === 'ok' ? 'check' : 'xCircle'} size={13} />{' '}
          {status.text}
        </p>
      )}

      {hasPin && preview}

      {/*
        The manual pair, kept for venues Google does not know and for correcting
        a pin by hand. Collapsed rather than removed: it is the fallback, not
        the path, and two decimal-degree boxes presented as equals are what
        produced the nulls in the first place.
      */}
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setManual((v) => !v)}
          aria-expanded={manual}
        >
          <Icon name={manual ? 'chevronDown' : 'chevronRight'} size={14} />
          {km ? 'បញ្ចូលកូអរដោនេដោយដៃ' : 'Enter coordinates manually'}
        </button>

        {manual && (
          <div className="advanced-row">
            <Field label={km ? 'រយៈទទឹង' : 'Latitude'}>
              <input
                className="input"
                type="number"
                step="0.000001"
                value={value.lat}
                onChange={(e) => onChange({ ...value, lat: e.target.value })}
              />
            </Field>
            <Field label={km ? 'រយៈបណ្តោយ' : 'Longitude'}>
              <input
                className="input"
                type="number"
                step="0.000001"
                value={value.lng}
                onChange={(e) => onChange({ ...value, lng: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}

const found = (km, c) =>
  km
    ? `រកឃើញទីតាំង៖ ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`
    : `Pin found: ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}. Check it below`

const unreadable = (km) =>
  km
    ? 'មិនអាចអានតំណនេះបានទេ។ សូមប្រើប៊ូតុង Share ក្នុង Google Maps។'
    : 'Could not read that link. Use the Share button in Google Maps, or enter the coordinates manually.'

const outside = (km) =>
  km
    ? 'ទីតាំងនេះនៅក្រៅប្រទេសកម្ពុជា។ សូមពិនិត្យតំណម្តងទៀត។'
    : 'That location is outside Cambodia. Check the link is for the right place.'
