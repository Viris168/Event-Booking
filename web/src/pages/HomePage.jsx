import { useEffect, useState } from 'react'
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
const QUICK_SEARCHES = [
  { q: 'pp', en: 'Phnom Penh', km: 'ភ្នំពេញ', icon: 'mapPin', params: { province: '12' } },
  { q: 'sr', en: 'Siem Reap', km: 'សៀមរាប', icon: 'mapPin', params: { province: '17' } },
  { q: 'concert', en: 'Concerts', km: 'ការប្រគំតន្ត្រី', icon: 'music', params: { q: 'concert' } },
  { q: 'festival', en: 'Festivals', km: 'មហោស្រព', icon: 'festival', params: { q: 'festival' } },
  { q: 'cheap', en: 'Under $20', km: 'ក្រោម $20', icon: 'wallet', params: { maxUsd: '20' } },
]

/** Whole days from now until an ISO date, floored at 0. */
function daysUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

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

/**
 * "Next up" card in the hero. Fills the empty half of the banner with the
 * soonest event on sale, and gives the page a single obvious first action.
 */
function Spotlight({ event }) {
  const { t, locale, date, time } = useLocale()
  const art = eventArt(event, 'cover')
  const venue = event.venue
  const price = getMinPriceCents(event)
  const start = event.startsAt ?? event.starts_at
  const left = daysUntil(start)
  const scarce = getScarcity(event)

  const countdown =
    left === 0
      ? locale === 'km'
        ? 'ថ្ងៃនេះ'
        : 'Tonight'
      : left === 1
        ? locale === 'km'
          ? 'ថ្ងៃស្អែក'
          : 'Tomorrow'
        : locale === 'km'
          ? `ក្នុងរយៈពេល ${left} ថ្ងៃ`
          : `In ${left} days`

  return (
    <aside className="spotlight" aria-label={locale === 'km' ? 'ព្រឹត្តិការណ៍បន្ទាប់' : 'Next event'}>
      <div className="spot-head">
        <span className="tiny">
          <Icon name="clock" size={13} /> {locale === 'km' ? 'ជិតមកដល់' : 'Next up'}
        </span>
        <span className="spot-when">{countdown}</span>
      </div>

      <Link
        to={`/events/${event.id}`}
        className={`spot-art ${art.className}${art.hasImage ? ' has-photo' : ''}`}
      >
        {art.hasImage ? (
          <img
            className="ev-photo"
            src={art.url}
            alt=""
            decoding="async"
            onError={(e) => {
              e.currentTarget.remove()
            }}
          />
        ) : (
          <Icon
            name={CATEGORY_ICON[event.category] || 'ticket'}
            size={48}
            strokeWidth={1.3}
            className="cat-icon"
          />
        )}
        {(scarce.level === 'almost-full' || scarce.level === 'filling') && (
          <span className="spot-flag badge badge-solid badge-hot">
            <Icon name="trending" size={12} />
            {scarce.level === 'almost-full'
              ? t('almostFull')
              : `${scarce.remaining} ${t('seatsLeft')}`}
          </span>
        )}
      </Link>

      <div className="spot-body">
        <strong>{locale === 'km' ? (event.titleKm ?? event.title_km) : (event.titleEn ?? event.title_en)}</strong>
        <span className={locale === 'km' ? 'spot-alt' : 'spot-alt km'}>
          {locale === 'km' ? (event.titleEn ?? event.title_en) : (event.titleKm ?? event.title_km)}
        </span>
        <span className="spot-meta">
          <Icon name="mapPin" size={14} />
          {locale === 'km' ? venue?.nameKm : venue?.nameEn}
        </span>
        <span className="spot-meta">
          <Icon name="calendar" size={14} />
          {date(event.startsAt ?? event.starts_at)} · {time(event.doorsOpenAt ?? event.doors_open_at)} {t('doorsOpen').toLowerCase()}
        </span>
      </div>

      <div className="spot-foot">
        <span className="price-tag">
          <span className="tiny">{t('from_price')}</span>
          <Money cents={price} stacked />
        </span>
        <Link className="btn btn-accent btn-sm" to={`/events/${event.id}`}>
          {locale === 'km' ? 'មើលព្រឹត្តិការណ៍' : 'View event'}
          <Icon name="arrowRight" size={14} />
        </Link>
      </div>
    </aside>
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

  const spotlight = published[0]
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
        <div className="hero-inner hero-grid">
          <div className="hero-copy">
          <span className="hero-kicker">
            <Icon name="qr" size={14} />
            {locale === 'km' ? 'បង់ប្រាក់តាមបាគង និង ABA' : 'Pay with Bakong KHQR & ABA PayWay'}
          </span>
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

          {/* The soonest event, sold from the hero itself rather than leaving
              half the banner empty. */}
          {loading ? <SpotlightSkeleton /> : spotlight && <Spotlight event={spotlight} />}
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

        <section style={{ marginTop: '2.5rem' }}>
          <div className="demo-note">
            <b className="with-icon">
              <Icon name="info" size={14} />
              Prototype build.
            </b>{' '}
            Everything on this site is mock data held in the
            browser — no API calls are made. Log in as <span className="mono">dara@example.com</span>{' '}
            (customer), <span className="mono">organizer@example.com</span>, or{' '}
            <span className="mono">admin@example.com</span> with the password{' '}
            <span className="mono">password</span> — each one lands in a different role
            experience.
          </div>
        </section>
      </div>
    </>
  )
}
