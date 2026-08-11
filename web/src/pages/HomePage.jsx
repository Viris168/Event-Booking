import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EventCard from '../components/EventCard.jsx'
import Icon from '../components/Icon.jsx'
import { ActiveFilters, Empty, IconSelect, SearchInput } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { PROVINCES, listEvents, platformStats, useStore } from '../mock/store.js'

// One tap into the searches people actually run.
const QUICK_SEARCHES = [
  { q: 'pp', en: 'Phnom Penh', km: 'ភ្នំពេញ', icon: 'mapPin', params: { province: 'PP' } },
  { q: 'sr', en: 'Siem Reap', km: 'សៀមរាប', icon: 'mapPin', params: { province: 'SR' } },
  { q: 'concert', en: 'Concerts', km: 'ការប្រគំតន្ត្រី', icon: 'music', params: { q: 'concert' } },
  { q: 'festival', en: 'Festivals', km: 'មហោស្រព', icon: 'festival', params: { q: 'festival' } },
  { q: 'cheap', en: 'Under $20', km: 'ក្រោម $20', icon: 'wallet', params: { maxUsd: '20' } },
]

export default function HomePage() {
  useStore()
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [province, setProvince] = useState('')

  const published = listEvents({ sort: 'soonest' })
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
        <div className="hero-inner">
          <span className="hero-kicker">
            <Icon name="qr" size={14} />
            {locale === 'km' ? 'បង់ប្រាក់តាមបាគង និង ABA' : 'Pay with Bakong KHQR & ABA PayWay'}
          </span>
          <h1>{t('heroTitle')}</h1>
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
              {t('search')}
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
