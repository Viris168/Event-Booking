import { Link } from 'react-router-dom'
import Icon, { CATEGORY_ICON } from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { getVenue, minPriceCents, provinceName, scarcity } from '../mock/store.js'
import { Money } from './ui.jsx'

/** Scarcity badge — exact counts only while there is real headroom. */
function ScarcityFlag({ eventId }) {
  const { t } = useLocale()
  const s = scarcity(eventId)
  if (s.level === 'sold-out')
    return (
      <span className="badge badge-solid badge-hot">
        <Icon name="xCircle" size={12} />
        {t('soldOut')}
      </span>
    )
  if (s.level === 'almost-full')
    return (
      <span className="badge badge-solid badge-hot">
        <Icon name="trending" size={12} />
        {t('almostFull')}
      </span>
    )
  if (s.level === 'filling')
    return (
      <span className="badge badge-solid badge-warm">
        <Icon name="trending" size={12} />
        {s.remaining} {t('seatsLeft')}
      </span>
    )
  return null
}

export default function EventCard({ event }) {
  const { locale, t, date } = useLocale()
  const venue = getVenue(event.venue_id)
  const price = minPriceCents(event.id)
  const start = new Date(event.starts_at)

  const title = locale === 'km' ? event.title_km : event.title_en
  const subtitle = locale === 'km' ? event.title_en : event.title_km

  return (
    <Link to={`/events/${event.id}`} className="ev-card">
      <div className={`ev-media cover-${event.cover}`}>
        <Icon name={CATEGORY_ICON[event.category] || 'ticket'} size={44} strokeWidth={1.4} className="cat-icon" />
        <span className="ev-date">
          {start.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
          <b>{start.getDate()}</b>
        </span>
        <span className="ev-flag">
          <ScarcityFlag eventId={event.id} />
        </span>
      </div>

      <div className="ev-body">
        <div className="row row-tight">
          <span className="badge badge-mode">
            <Icon name={event.inventory_mode === 'ZONED' ? 'users' : 'seat'} size={12} />
            {event.inventory_mode}
          </span>
          {event.status !== 'PUBLISHED' && <span className={`badge s-${event.status}`}>{event.status}</span>}
        </div>
        <div className="ev-title">{title}</div>
        <div className={locale === 'km' ? 'ev-title-km' : 'ev-title-km km'}>{subtitle}</div>
        <div className="ev-meta">
          <span className="meta-row">
            <Icon name="mapPin" size={14} />
            <span>{locale === 'km' ? venue?.name_km : venue?.name_en}</span>
          </span>
          <span className="meta-row">
            <Icon name="calendar" size={14} />
            <span>
              {date(event.starts_at)} · {provinceName(venue?.province_code, locale)}
            </span>
          </span>
        </div>
      </div>

      <div className="ev-foot">
        <span className="price-tag">
          <span className="tiny">{t('from_price')}</span>
          <Money cents={price} stacked />
        </span>
        <span className="btn btn-sm btn-outline">
          <Icon name="arrowRight" size={15} />
        </span>
      </div>
    </Link>
  )
}
