import { Link } from 'react-router-dom'
import Icon, { CATEGORY_ICON } from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { provinceName } from '../mock/store.js'
import { Money } from './ui.jsx'

function getScarcity(event) {
  const capacity = event.totalCapacity ?? event.total_capacity ?? 0
  if (!capacity) return { level: 'none' }
  const remaining = capacity - (event.totalSold ?? event.total_sold ?? 0) - (event.totalHeld ?? event.total_held ?? 0)
  if (remaining <= 0) return { level: 'sold-out' }
  const pct = remaining / capacity
  if (remaining <= 12) return { level: 'almost-full' }
  if (pct <= 0.2) return { level: 'filling', remaining }
  return { level: 'ok', remaining }
}

function getMinPriceCents(event) {
  let min = Infinity
  const classes = event.seatClasses ?? event.seat_classes ?? []
  classes.forEach((c) => (min = Math.min(min, c.priceUsdCents ?? c.price_usd_cents ?? 0)))
  const zones = event.zones ?? []
  zones.forEach((z) => (min = Math.min(min, z.priceUsdCents ?? z.price_usd_cents ?? 0)))
  return min === Infinity ? 0 : min
}

/** Scarcity badge — exact counts only while there is real headroom. */
function ScarcityFlag({ event }) {
  const { t } = useLocale()
  const s = getScarcity(event)
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
  const venue = event.venue
  const price = getMinPriceCents(event)
  const start = new Date(event.startsAt ?? event.starts_at)

  const titleEn = event.titleEn ?? event.title_en
  const titleKm = event.titleKm ?? event.title_km
  const title = locale === 'km' ? titleKm : titleEn
  const subtitle = locale === 'km' ? titleEn : titleKm

  return (
    <Link to={`/events/${event.id}`} className="ev-card">
      <div className={`ev-media cover-${event.cover || 1}`}>
        <Icon name={CATEGORY_ICON[event.category] || 'ticket'} size={44} strokeWidth={1.4} className="cat-icon" />
        <span className="ev-date">
          {start.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
          <b>{start.getDate()}</b>
        </span>
        <span className="ev-flag">
          <ScarcityFlag event={event} />
        </span>
      </div>

      <div className="ev-body">
        <div className="row row-tight">
          <span className="badge badge-mode">
            <Icon name={(event.inventoryMode ?? event.inventory_mode) === 'ZONED' ? 'users' : 'seat'} size={12} />
            {event.inventoryMode ?? event.inventory_mode}
          </span>
          {event.status !== 'PUBLISHED' && <span className={`badge s-${event.status}`}>{event.status}</span>}
        </div>
        <div className="ev-title">{title}</div>
        <div className={locale === 'km' ? 'ev-title-km' : 'ev-title-km km'}>{subtitle}</div>
        <div className="ev-meta">
          <span className="meta-row">
            <Icon name="mapPin" size={14} />
            <span>{locale === 'km' ? venue?.nameKm : venue?.nameEn}</span>
          </span>
          <span className="meta-row">
            <Icon name="calendar" size={14} />
            <span>
              {date(event.startsAt ?? event.starts_at)} · {provinceName(venue?.provinceCode ?? venue?.province_code, locale)}
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
