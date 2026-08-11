import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EventCard from '../components/EventCard.jsx'
import Icon, { CATEGORY_ICON } from '../components/Icon.jsx'
import { Empty, IconSelect, Money, SearchInput } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import {
  PROVINCES,
  getVenue,
  listEvents,
  minPriceCents,
  platformStats,
  scarcity,
  useStore,
} from '../mock/store.js'

// One tap into the searches people actually run.
const QUICK_SEARCHES = [
  { q: 'pp', en: 'Phnom Penh', km: 'ភ្នំពេញ', icon: 'mapPin', params: { province: 'PP' } },
  { q: 'sr', en: 'Siem Reap', km: 'សៀមរាប', icon: 'mapPin', params: { province: 'SR' } },
  { q: 'concert', en: 'Concerts', km: 'ការប្រគំតន្ត្រី', icon: 'music', params: { q: 'concert' } },
  { q: 'festival', en: 'Festivals', km: 'មហោស្រព', icon: 'festival', params: { q: 'festival' } },
  { q: 'cheap', en: 'Under $20', km: 'ក្រោម $20', icon: 'wallet', params: { maxUsd: '20' } },
]

/** Whole days from now until an ISO date, floored at 0. */
function daysUntil(iso) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

/**
 * "Next up" card in the hero. Fills the empty half of the banner with the
 * soonest event on sale, and gives the page a single obvious first action.
 */
function Spotlight({ event }) {
  const { t, locale, date, time } = useLocale()
  const venue = getVenue(event.venue_id)
  const price = minPriceCents(event.id)
  const left = daysUntil(event.starts_at)
  const scarce = scarcity(event.id)

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

      <Link to={`/events/${event.id}`} className={`spot-art cover-${event.cover}`}>
        <Icon
          name={CATEGORY_ICON[event.category] || 'ticket'}
          size={48}
          strokeWidth={1.3}
          className="cat-icon"
        />
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
        <strong>{locale === 'km' ? event.title_km : event.title_en}</strong>
        <span className={locale === 'km' ? 'spot-alt' : 'spot-alt km'}>
          {locale === 'km' ? event.title_en : event.title_km}
        </span>
        <span className="spot-meta">
          <Icon name="mapPin" size={14} />
          {locale === 'km' ? venue?.name_km : venue?.name_en}
        </span>
        <span className="spot-meta">
          <Icon name="calendar" size={14} />
          {date(event.starts_at)} · {time(event.doors_open_at)} {t('doorsOpen').toLowerCase()}
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
  useStore()
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [province, setProvince] = useState('')

  const published = listEvents({ sort: 'soonest' })
  const spotlight = published[0]
  const featured = published.slice(0, 4)
  const upcoming = published.slice(4, 12)
  const stats = platformStats()

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
                {PROVINCES.map((p) => (
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
              <b>{stats.published}</b>
              {locale === 'km' ? 'ព្រឹត្តិការណ៍ផ្សាយ' : 'live events'}
            </div>
            <div>
              <b>{stats.ticketsIssued.toLocaleString()}</b>
              {locale === 'km' ? 'សំបុត្រចេញរួច' : 'tickets issued'}
            </div>
            <div>
              <b>{PROVINCES.length}</b>
              {locale === 'km' ? 'ខេត្ត/ក្រុង' : 'provinces covered'}
            </div>
          </div>
          </div>

          {/* The soonest event, sold from the hero itself rather than leaving
              half the banner empty. */}
          {spotlight && <Spotlight event={spotlight} />}
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
          {featured.length ? (
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
          <div className="grid grid-cards">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
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
            <span className="mono">password</span>, or use the role switcher (gear icon) in the navbar.
          </div>
        </section>
      </div>
    </>
  )
}
