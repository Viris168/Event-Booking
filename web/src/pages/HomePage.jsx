import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EventCard from '../components/EventCard.jsx'
import Icon, { CATEGORY_ICON } from '../components/Icon.jsx'
import { EventGridSkeleton, SpotlightSkeleton } from '../components/Skeleton.jsx'
import { Empty, IconSelect, Money, SearchInput } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useProvinces } from '../lib/useProvinces.js'
import { eventArt } from '../lib/eventArt.js'
import { getEvents } from '../api/events.js'

// One tap into the searches people actually run.
//
// Province codes are the numeric ones the API returns ("12" = Phnom Penh), not
// the two-letter abbreviations the retired mock store used. Those old 'PP' /
// 'SR' values matched no row once the filter started hitting the real
// endpoint, so both chips returned an empty grid.
/* Hero backdrop, served from web/public. If the file is missing the banner
   falls back to its gradient rather than breaking, so swapping the art is just
   a change to this one constant. */
const HERO_IMAGE = '/event.jpeg'

const QUICK_SEARCHES = [
  { q: 'pp', en: 'Phnom Penh', km: 'ភ្នំពេញ', icon: 'mapPin', params: { province: '12' } },
  { q: 'sr', en: 'Siem Reap', km: 'សៀមរាប', icon: 'mapPin', params: { province: '17' } },
  { q: 'concert', en: 'Concerts', km: 'ការប្រគំតន្ត្រី', icon: 'music', params: { q: 'concert' } },
  { q: 'festival', en: 'Festivals', km: 'មហោស្រព', icon: 'festival', params: { q: 'festival' } },
  { q: 'cheap', en: 'Under $20', km: 'ក្រោម $20', icon: 'wallet', params: { maxUsd: '20' } },
]

/** How often the hero rail advances, in ms. */
const ROTATE_MS = 5000
/** Cards in the rail. More than this and the dots stop being scannable. */
const RAIL_SIZE = 5

function getMinPriceCents(event) {
  let min = Infinity
  const classes = event.seatClasses ?? event.seat_classes ?? []
  classes.forEach((c) => (min = Math.min(min, c.priceUsdCents ?? c.price_usd_cents ?? 0)))
  const zones = event.zones ?? []
  zones.forEach((z) => (min = Math.min(min, z.priceUsdCents ?? z.price_usd_cents ?? 0)))
  return min === Infinity ? 0 : min
}

/**
 * The rail's card. Deliberately NOT the grid's EventCard: this one sits on a
 * photographic banner, so it is a single piece of artwork with the detail laid
 * over it, rather than a picture stacked on a white body. That also makes it
 * shorter, which is what lets it sit beside the headline without crowding.
 */
function RailCard({ event }) {
  const { t, locale } = useLocale()
  const art = eventArt(event, 'cover')
  const venue = event.venue
  const price = getMinPriceCents(event)
  const start = new Date(event.startsAt ?? event.starts_at)
  const title = locale === 'km' ? (event.titleKm ?? event.title_km) : (event.titleEn ?? event.title_en)
  const venueName = locale === 'km' ? (venue?.nameKm ?? venue?.name_km) : (venue?.nameEn ?? venue?.name_en)

  return (
    <Link
      to={`/events/${event.id}`}
      className={`rail-card ${art.className}${art.hasImage ? ' has-photo' : ''}`}
    >
      {art.hasImage ? (
        <img className="ev-photo" src={art.url} alt="" decoding="async"
          onError={(e) => { e.currentTarget.remove() }} />
      ) : (
        <Icon name={CATEGORY_ICON[event.category] || 'ticket'} size={44} strokeWidth={1.3} className="rail-icon" />
      )}

      <span className="rail-date">
        {start.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
        <b>{start.getDate()}</b>
      </span>

      <div className="rail-body">
        <strong>{title}</strong>
        {venueName && (
          <span className="rail-meta">
            <Icon name="mapPin" size={13} />
            {venueName}
          </span>
        )}
        <span className="rail-price">
          {t('from_price')} <b><Money cents={price} /></b>
        </span>
      </div>
    </Link>
  )
}

/**
 * The upcoming events, one card at a time, advancing on its own.
 *
 * Auto-advancing content has to be stoppable (WCAG 2.2.2), so the timer pauses
 * while the pointer is over the rail and while focus is inside it — otherwise
 * the card can slide out from under someone mid-click or mid-read. The dots are
 * real buttons, so there is a manual way through regardless.
 */
function HeroRail({ events }) {
  const { locale } = useLocale()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = events.length

  // Derived, not stored: if the list shrinks, a stale index would otherwise
  // translate the track into empty space. Wrapping here beats correcting it in
  // an effect, which would cost an extra render every time.
  const active = count ? index % count : 0

  // Re-keyed on `active` too, so choosing a dot restarts the full interval
  // instead of inheriting whatever was left of the previous one.
  useEffect(() => {
    if (paused || count < 2) return undefined
    const id = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => clearTimeout(id)
  }, [active, paused, count])

  const hold = useCallback(() => setPaused(true), [])
  const release = useCallback(() => setPaused(false), [])

  if (!count) return null

  return (
    <div
      className="hero-rail"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      aria-roledescription="carousel"
      aria-label={locale === 'km' ? 'ព្រឹត្តិការណ៍ជិតមកដល់' : 'Upcoming events'}
    >
      <div className="hero-rail-head">
        <span className="tiny">
          <Icon name="clock" size={13} /> {locale === 'km' ? 'ជិតមកដល់' : 'Next up'}
        </span>
      </div>

      <div className="hero-viewport">
        <div className="hero-track" style={{ transform: `translateX(-${active * 100}%)` }}>
          {events.map((e, i) => (
            /* Off-screen slides keep their links in the tab order unless they
               are inerted — the classic carousel focus trap, where tabbing
               walks into cards nobody can see. */
            <div className="hero-slide" key={e.id} inert={i !== active ? '' : undefined}>
              <RailCard event={e} />
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="hero-dots">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              className={`hero-dot${i === active ? ' on' : ''}`}
              aria-current={i === active}
              aria-label={`${locale === 'km' ? 'ព្រឹត្តិការណ៍' : 'Event'} ${i + 1}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const { t, locale } = useLocale()
  const { provinces } = useProvinces()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [province, setProvince] = useState('')

  const [published, setPublished] = useState([])
  // The catalogue-wide count, which the loaded page of 12 cannot give on its own.
  const [totalLive, setTotalLive] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEvents({ size: 12, sort: 'startsAt,asc' })
      .then((page) => {
        setPublished(page.content || [])
        setTotalLive(page.total_elements ?? page.totalElements ?? (page.content || []).length)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  const rail = published.slice(0, RAIL_SIZE)
  const featured = published.slice(0, 4)
  const upcoming = published.slice(4, 12)

  /**
   * Hero counters, from the API instead of the retired mock store.
   *
   * `live` and `provinces` are exact - one is the page's total_elements, the
   * other the length of the reference list. `sold` is summed over the events
   * actually loaded (at most 12), so on a catalogue larger than one page it
   * under-reports. Shown anyway because there is no aggregate endpoint for it,
   * and an honest floor beats a number invented in the browser.
   */
  const ticketsSold = published.reduce(
    (sum, e) => sum + (e.total_sold ?? e.totalSold ?? 0),
    0,
  )

  function submit(e) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (province) params.set('province', province)
    navigate(`/events?${params.toString()}`)
  }

  return (
    <>
      <section className="hero">
        {/* Decorative backdrop, so it carries no alt text. The gradient beneath
            is what shows while this decodes — and what remains if the file is
            missing, since the image removes itself on error. That fallback is
            the reason the banner still looks finished with no art in place. */}
        <img
          className="hero-bg"
          src={HERO_IMAGE}
          alt=""
          fetchPriority="high"
          decoding="async"
          onError={(e) => {
            e.currentTarget.remove()
          }}
        />
        <div className="hero-inner hero-grid">
          <div className="hero-copy">
          <h1>
            {t('heroTitleLead')} <span className="hero-accent">{t('heroTitleAccent')}</span>
          </h1>
          <p>{t('heroSub')}</p>

          <form className="searchbar" onSubmit={submit} role="search">
            <span className="sb-cell">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder={
                  locale === 'km'
                    ? 'ស្វែងរកព្រឹត្តិការណ៍ សិល្បករ ឬទីកន្លែង'
                    : 'Search events, artists or venues'
                }
                ariaLabel={t('search')}
              />
            </span>
            <span className="sb-cell">
              <IconSelect
                icon="mapPin"
                value={province}
                onChange={setProvince}
                ariaLabel={t('province')}
              >
                <option value="">{t('allProvinces')}</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {locale === 'km' ? p.name_km : p.name_en}
                  </option>
                ))}
              </IconSelect>
            </span>
            <button className="btn btn-primary" type="submit">
              <Icon name="search" size={16} />
              {t('searchLabel')}
            </button>
          </form>

          {/* Straight into the most common intents, no typing required. */}
          <div className="quick-links">
            <span className="tiny">{locale === 'km' ? 'ពេញនិយម' : 'Popular'}</span>
            {QUICK_SEARCHES.map((s) => (
              <Link key={s.q} className="quick-chip" to={`/events?${new URLSearchParams(s.params)}`}>
                <Icon name={s.icon} size={13} />
                {locale === 'km' ? s.km : s.en}
              </Link>
            ))}
          </div>

          </div>

          {loading ? <SpotlightSkeleton /> : <HeroRail events={rail} />}
        </div>

        {/* The numbers sit on a rule at the foot of the banner. They used to
            trail off the bottom of the copy column, which left the hero with no
            base and the right half empty below the card. */}
        <div className="hero-base">
          <div className="hero-inner hero-base-inner">
            <div className="hero-stats">
              <div>
                <b>{totalLive}</b>
                {locale === 'km' ? 'ព្រឹត្តិការណ៍ផ្សាយ' : 'live events'}
              </div>
              <div>
                <b>{ticketsSold.toLocaleString()}</b>
                {locale === 'km' ? 'សំបុត្រលក់រួច' : 'tickets sold'}
              </div>
              <div>
                <b>{provinces.length}</b>
                {locale === 'km' ? 'ខេត្ត/ក្រុង' : 'provinces covered'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <section>
          <div className="section-head">
            <h2>{t('featured')}</h2>
            <Link to="/events" className="with-icon">
              {t('viewAll')}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          {loading ? (
            <EventGridSkeleton count={4} />
          ) : featured.length ? (
            <div className="grid grid-cards">
              {featured.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <Empty title={t('noEvents')} />
          )}
        </section>

        <section style={{ marginTop: '2.5rem' }}>
          <div className="section-head">
            <h2>{t('upcoming')}</h2>
            <Link to="/events" className="with-icon">
              {t('viewAll')}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          {loading ? (
            <EventGridSkeleton count={8} />
          ) : (
            <div className="grid grid-cards">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          )}
        </section>

      </div>
    </>
  )
}
