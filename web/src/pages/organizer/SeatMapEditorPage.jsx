import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import SeatMapEditor from '../../components/SeatMapEditor.jsx'
import { Alert } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useProvinces } from '../../lib/useProvinces.js'
import { getVenue, getVenueSeatMap } from '../../api/venues.js'
import { mapVenue } from '../../api/adapters.js'

/**
 * Page chrome around {@link SeatMapEditor}: breadcrumb, venue name, seat count.
 *
 * <p>The editor itself has been talking to the server for a while; this page
 * was still reading the venue from the prototype store, which meant a venue
 * that existed only in the database rendered "Venue not found" and the working
 * editor below it never got a chance to load. The header lied about the page
 * being broken while the feature underneath it was fine.
 */
export default function SeatMapEditorPage() {
  const { id } = useParams()
  const { t, locale } = useLocale()
  const { provinceName } = useProvinces()

  const [venue, setVenue] = useState(null)
  const [seatCount, setSeatCount] = useState(null)
  // Three states, not two: without a pending state the first paint has no
  // venue yet and renders "not found" at every visitor before the fetch
  // resolves.
  const [status, setStatus] = useState('loading')
  // Which id the state above describes. Navigating between venues must show a
  // spinner, not the previous venue's name - and tracking that here avoids
  // resetting status from inside the effect, which is a cascading render.
  const [loadedId, setLoadedId] = useState(null)

  const loadSeatCount = useCallback(() => {
    // A venue with no seat map is a normal ZONED-only venue, not an error -
    // the endpoint 404s and the count is simply zero.
    getVenueSeatMap(id)
      .then((map) => {
        const seats = map?.seats ?? map?.sections?.flatMap((s) => s.seats ?? []) ?? []
        setSeatCount(seats.length)
      })
      .catch(() => setSeatCount(0))
  }, [id])

  useEffect(() => {
    let live = true
    getVenue(id)
      .then((v) => {
        if (!live) return
        setVenue(mapVenue(v))
        setStatus('ready')
        setLoadedId(id)
      })
      .catch(() => {
        if (!live) return
        setStatus('missing')
        setLoadedId(id)
      })
    loadSeatCount()
    return () => {
      live = false
    }
  }, [id, loadSeatCount])

  if (status === 'loading' || loadedId !== id) {
    return (
      <div className="container">
        <p className="muted">{locale === 'km' ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
      </div>
    )
  }

  if (status === 'missing' || !venue) {
    return (
      <div className="container">
        <Alert tone="danger" title="Venue not found">
          <Link to="/organizer/venues" className="with-icon">
            <Icon name="arrowLeft" size={15} />
            {t('venues')}
          </Link>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container container-wide">
      <div className="breadcrumb">
        <Link to="/organizer/venues">{t('venues')}</Link> /{' '}
        {locale === 'km' ? venue.name_km : venue.name_en}
      </div>

      <div className="page-head">
        <div>
          <h1>{t('seatMap')}</h1>
          <p>
            {locale === 'km' ? venue.name_km : venue.name_en} ·{' '}
            {provinceName(venue.province_code, locale)}
            {seatCount === null ? '' : ` · ${seatCount} ${locale === 'km' ? 'កៅអី' : 'seats'}`}
          </p>
        </div>
      </div>

      {/* onChange keeps the count in the header honest after a section is
          generated; the editor owns its own copy of the map. */}
      <SeatMapEditor venueId={venue.id} onChange={loadSeatCount} />
    </div>
  )
}
