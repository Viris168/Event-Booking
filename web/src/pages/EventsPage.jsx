import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EventCard from '../components/EventCard.jsx'
import Icon from '../components/Icon.jsx'
import { ActiveFilters, Empty, Field, IconSelect, Pager, SearchInput } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { PROVINCES, listEvents, provinceName, useStore } from '../mock/store.js'

const PAGE_SIZE = 8
const EMPTY = { q: '', province: '', from: '', to: '', minUsd: '', maxUsd: '', sort: 'soonest' }

export default function EventsPage() {
  useStore()
  const { t, locale, date } = useLocale()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const filters = { ...EMPTY }
  for (const key of Object.keys(EMPTY)) filters[key] = params.get(key) ?? EMPTY[key]

  function update(patch) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
    setPage(1)
  }

  const results = useMemo(() => listEvents(filters), [params]) // eslint-disable-line react-hooks/exhaustive-deps
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
          <p>
            {results.length}{' '}
            {locale === 'km'
              ? 'ព្រឹត្តិការណ៍កំពុងលក់សំបុត្រ'
              : `${results.length === 1 ? 'event' : 'events'} currently on sale`}
          </p>
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
              {PROVINCES.map((p) => (
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

      {visible.length ? (
        <>
          <div className="grid grid-cards" style={{ marginTop: '1.4rem' }}>
            {visible.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
          <Pager page={current} pages={pages} onChange={setPage} />
        </>
      ) : (
        <Empty icon="search" title={t('noEvents')}>
          {locale === 'km' ? 'សូមសម្រួលតម្រងរបស់អ្នក' : 'Try widening your filters.'}
        </Empty>
      )}
    </div>
  )
}
