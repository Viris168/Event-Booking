import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import SeatMapEditor from '../../components/SeatMapEditor.jsx'
import { Alert, Field, ResponsiveTable } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import {
  getVenue,
  provinceName,
  useStore,
  venueSeatsOf,
} from '../../mock/store.js'

/** Read-only render of venue_seat positions, grouped by section. */
export default function SeatMapEditorPage() {
  const { id } = useParams()
  useStore()
  const { t, locale } = useLocale()

  const venue = getVenue(id)
  const seats = venueSeatsOf(id)

  if (!venue) {
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
            {provinceName(venue.province_code, locale)} · {seats.length}{' '}
            {locale === 'km' ? 'កៅអី' : 'seats'}
          </p>
        </div>
      </div>

        <SeatMapEditor venueId={venue.id} />
    </div>
  )
}
