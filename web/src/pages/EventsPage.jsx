import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EventCard from '../components/EventCard.jsx'
import Icon from '../components/Icon.jsx'
import { EventGridSkeleton, Skeleton } from '../components/Skeleton.jsx'
import { ActiveFilters, Empty, Field, IconSelect, Pager, SearchInput } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useProvinces } from '../lib/useProvinces.js'
import { getEvents } from '../api/events.js'
import { mapEvent } from '../api/adapters.js'

const PAGE_SIZE = 8
const EMPTY = { q: '', province: '', from: '', to: '', minUsd: '', maxUsd: '', sort: 'soonest' }

export default function EventsPage() {
  const { t, locale, date } = useLocale()
  const { provinces, provinceName } = useProvinces()
  useDocumentTitle(t('events'))
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [apiResults, setApiResults] = useState([])
  const [failed, setFailed] = useState(false)
  // Bumped by Retry. Re-setting identical search params would not change the
  // effect's dependency, so a failed read had no way to be re-run.
  const [reload, setReload] = useState(0)
  // Placeholders until the read settles, so the grid never jumps.
  const [loading, setLoading] = useState(true)

  const filters = { ...EMPTY }
  for (const key of Object.keys(EMPTY)) filters[key] = params.get(key) ?? EMPTY[key]

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    getEvents(filters)
      .then((data) => {
        if (!active) return
        const list = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : [])
        setApiResults(list.map(mapEvent))
      })
      .catch(() => {
        // No mock fallback: seeded events standing in for a failed read looked
        // like a working catalogue and hid the outage completely.
        if (!active) return
        setApiResults([])
        setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [params, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(patch) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
    setPage(1)
  }

  const results = apiResults
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  // Everything narrowing the result set, as removable chips.
  const chips = []
  if (filters.q)
    chips.push({ key: 'q', icon: 'search', label: `“${filters.q}”`, onRemove: () => update({ q: '' }) })
  if (filters.province)
    chips.push({
      key: 'province',
      icon: 'mapPin',
      label: provinceName(filters.province, locale),
      onRemove: () => update({ province: '' }),
    })
  if (filters.from)
    chips.push({
      key: 'from',
      icon: 'calendar',
      label: `${t('from')} ${date(filters.from)}`,
      onRemove: () => update({ from: '' }),
    })
  if (filters.to)
    chips.push({
      key: 'to',
      icon: 'calendar',
      label: `${t('to')} ${date(filters.to)}`,
      onRemove: () => update({ to: '' }),
    })
  if (filters.minUsd)
    chips.push({
      key: 'minUsd',
      icon: 'wallet',
      label: `≥ $${filters.minUsd}`,
      onRemove: () => update({ minUsd: '' }),
    })
  if (filters.maxUsd)
    chips.push({
      key: 'maxUsd',
      icon: 'wallet',
      label: `≤ $${filters.maxUsd}`,
      onRemove: () => update({ maxUsd: '' }),
    })

  const advancedActive = !!(filters.from || filters.to || filters.minUsd || filters.maxUsd)

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('events')}</h1>
          {loading ? (
            <Skeleton className="skel-line mt-2 w-52" />
          ) : (
            <p>
              {results.length}{' '}
              {locale === 'km'
                ? 'ព្រឹត្តិការណ៍កំពុងលក់សំបុត្រ'
                : `${results.length === 1 ? 'event' : 'events'} currently on sale`}
            </p>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- search bar */}
      <div className="panel searchpanel">
        <div className="panel-body">
          <div className="search-row">
            <SearchInput
              value={filters.q}
              onChange={(v) => update({ q: v })}
              placeholder={
                locale === 'km'
                  ? 'ស្វែងរកព្រឹត្តិការណ៍ ឬទីកន្លែង'
                  : 'Search events, artists or venues'
              }
              ariaLabel={t('search')}
              className="search-main"
            />
            <IconSelect
              icon="mapPin"
              value={filters.province}
              onChange={(v) => update({ province: v })}
              ariaLabel={t('province')}
              className="search-province"
            >
              <option value="">{t('allProvinces')}</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {locale === 'km' ? p.name_km : p.name_en}
                </option>
              ))}
            </IconSelect>
            <IconSelect
              icon="filter"
              value={filters.sort}
              onChange={(v) => update({ sort: v })}
              ariaLabel={t('sort')}
              className="search-sort"
            >
              <option value="soonest">{t('soonest')}</option>
              <option value="priceLow">{t('priceLow')}</option>
              <option value="priceHigh">{t('priceHigh')}</option>
            </IconSelect>
            <button
              type="button"
              className={`btn ${showAdvanced || advancedActive ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              <Icon name="filter" size={16} />
              {t('filters')}
              {advancedActive && <span className="dot-badge" aria-hidden="true" />}
            </button>
          </div>

          {showAdvanced && (
            <div className="advanced-row">
              <Field label={t('from')}>
                <input
                  className="input"
                  type="date"
                  value={filters.from}
                  onChange={(e) => update({ from: e.target.value })}
                />
              </Field>
              <Field label={t('to')}>
                <input
                  className="input"
                  type="date"
                  value={filters.to}
                  onChange={(e) => update({ to: e.target.value })}
                />
              </Field>
              <Field label={t('minPrice')}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={filters.minUsd}
                  onChange={(e) => update({ minUsd: e.target.value })}
                />
              </Field>
              <Field label={t('maxPrice')}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="100"
                  value={filters.maxUsd}
                  onChange={(e) => update({ maxUsd: e.target.value })}
                />
              </Field>
            </div>
          )}

          {chips.length > 0 && (
            <div style={{ marginTop: '0.85rem' }}>
              <ActiveFilters
                items={chips}
                onClearAll={() => setParams(new URLSearchParams())}
                clearAllLabel={t('reset')}
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <EventGridSkeleton count={PAGE_SIZE} style={{ marginTop: '1.4rem' }} />
      ) : visible.length ? (
        <>
          <div className="grid grid-cards" style={{ marginTop: '1.4rem' }}>
            {visible.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
          <Pager page={current} pages={pages} onChange={setPage} />
        </>
      ) : failed ? (
        <Empty
          icon="xCircle"
          title={locale === 'km' ? 'មិនអាចផ្ទុកព្រឹត្តិការណ៍' : 'Could not load events'}
        >
          {locale === 'km'
            ? 'សូមព្យាយាមម្តងទៀត។'
            : 'The catalogue is unavailable right now. Please try again.'}
          <button
            className="btn btn-sm btn-primary"
            style={{ marginTop: '0.8rem' }}
            onClick={() => setReload((n) => n + 1)}
          >
            <Icon name="refresh" size={14} />
            {locale === 'km' ? 'ព្យាយាមម្តងទៀត' : 'Retry'}
          </button>
        </Empty>
      ) : (
        <Empty icon="search" title={t('noEvents')}>
          {locale === 'km' ? 'សូមសម្រួលតម្រងរបស់អ្នក' : 'Try widening your filters.'}
          {chips.length > 0 && (
            <button
              className="btn btn-sm btn-primary"
              style={{ marginTop: '0.8rem' }}
              onClick={() => setParams(new URLSearchParams())}
            >
              <Icon name="close" size={14} />
              {t('reset')}
            </button>
          )}
        </Empty>
      )}
    </div>
  )
}
