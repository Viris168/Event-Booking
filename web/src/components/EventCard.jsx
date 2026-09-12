import { Link } from 'react-router-dom'
import Icon, { CATEGORY_ICON } from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useProvinces } from '../lib/useProvinces.js'
import { eventArt } from '../lib/eventArt.js'
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

/**
 * @param {boolean} compact  Drops the second-language title, the date row and
 *   the arrow. The hero rail sits beside the headline and the search, so it
 *   cannot afford the full record — and the date is already on the artwork
 *   chip, so showing it again was pure duplication.
 */
export default function EventCard({ event, compact = false }) {
  const { locale, t, date } = useLocale()
  const { provinceName } = useProvinces()
  const venue = event.venue
  const price = getMinPriceCents(event)
  const start = new Date(event.startsAt ?? event.starts_at)
  const art = eventArt(event, 'cover')
  const soldOut = getScarcity(event).level === 'sold-out'

  const titleEn = event.titleEn ?? event.title_en
  const titleKm = event.titleKm ?? event.title_km
  const title = locale === 'km' ? titleKm : titleEn
  const subtitle = locale === 'km' ? titleEn : titleKm

  const province = provinceName(venue?.provinceCode ?? venue?.province_code, locale)
  const venueName = locale === 'km' ? venue?.nameKm ?? venue?.name_km : venue?.nameEn ?? venue?.name_en

  return (
    <Link
      to={`/events/${event.id}`}
      className={`ev-card${soldOut ? ' is-soldout' : ''}${compact ? ' ev-card-compact' : ''}`}
    >
      {/* The gradient class stays on the box even when a photo loads: it is the
          colour behind a decoding image and the fallback if the URL 404s. */}
      <div className={`ev-media ${art.className}${art.hasImage ? ' has-photo' : ''}`}>
        {art.hasImage ? (
          <img
            className="ev-photo"
            src={art.url}
            alt=""
            loading="lazy"
            decoding="async"
            /* Drop back to the gradient underneath rather than showing a
               broken-image glyph if Cloudinary is unreachable. */
            onError={(e) => {
              e.currentTarget.remove()
            }}
          />
        ) : (
          <Icon
            name={CATEGORY_ICON[event.category] || 'ticket'}
            size={44}
            strokeWidth={1.4}
            className="cat-icon"
          />
        )}

        <span className="ev-date">
          {start.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
          <b>{start.getDate()}</b>
        </span>
        <span className="ev-flag">
          <ScarcityFlag event={event} />
        </span>

        <span className="ev-mode">
          <Icon name={(event.inventoryMode ?? event.inventory_mode) === 'ZONED' ? 'users' : 'seat'} size={11} />
          {event.inventoryMode ?? event.inventory_mode}
        </span>

        {event.category && (
          <span className="ev-cat">
            <Icon name={CATEGORY_ICON[event.category] || 'ticket'} size={12} />
            {event.category}
          </span>
        )}
      </div>

      <div className="ev-body">
        {event.status !== 'PUBLISHED' && (
          <div className="row row-tight">
            <span className={`badge s-${event.status}`}>{event.status}</span>
          </div>
        )}
        <div className="ev-title">{title}</div>
        {!compact && (
          <div className={locale === 'km' ? 'ev-title-km' : 'ev-title-km km'}>{subtitle}</div>
        )}
        <div className="ev-meta">
          <span className="meta-row">
            <Icon name="mapPin" size={14} />
            <span>
              {venueName}
              {province && <span className="meta-dim"> · {province}</span>}
            </span>
          </span>
          {!compact && (
            <span className="meta-row">
              <Icon name="calendar" size={14} />
              <span>{date(event.startsAt ?? event.starts_at)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="ev-foot">
        <span className="price-tag">
          <span className="tiny">{t('from_price')}</span>
          <Money cents={price} stacked />
        </span>
        {!compact && (
          <span className="btn btn-sm btn-outline ev-go" aria-hidden="true">
            <Icon name="arrowRight" size={15} />
          </span>
        )}
      </div>
    </Link>
  )
}
