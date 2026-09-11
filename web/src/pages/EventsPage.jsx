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

/** How long typing has to pause before the search reaches the URL and the API. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * What actually goes on the wire: the filters that are set, plus the window of
 * the catalogue to return.
 *
 * <p>Filtering and paging both happen on the server now. They have to happen in
 * the same place - this page used to ask for 20 events and then slice them into
 * pages of 8 in the browser, which made "3 pages" mean "the first 20 rows",
 * left event 21 unreachable, and printed a count that was really "up to 20".
 */
function requestParams(filters, page) {
  const query = { page: page - 1, size: PAGE_SIZE }
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value != null) query[key] = value
  }
  return query
}

export default function EventsPage() {
  const { t, locale, date } = useLocale()
  const { provinces, provinceName } = useProvinces()
  useDocumentTitle(t('events'))
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [apiResults, setApiResults] = useState([])
  // Straight from the server's Page, so the count and the pager describe the
  // whole catalogue rather than the slice that happens to be loaded.
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [failed, setFailed] = useState(false)
  // Bumped by Retry. Re-setting identical search params would not change the
  // effect's dependency, so a failed read had no way to be re-run.
  const [reload, setReload] = useState(0)
  // Placeholders until the read settles, so the grid never jumps.
  const [loading, setLoading] = useState(true)

  const filters = { ...EMPTY }
  for (const key of Object.keys(EMPTY)) filters[key] = params.get(key) ?? EMPTY[key]

  // What the search box shows while it is being typed in. The URL stays the
  // source of truth for what has actually been searched for; this is only the
  // draft on its way there.
  const [qDraft, setQDraft] = useState(filters.q)
  const [syncedQ, setSyncedQ] = useState(filters.q)

  // The search changed from somewhere other than the box: arriving from the
  // home page's search bar, removing the chip, Reset, or the back button.
  // Adjusted here rather than in an effect because that is what React
  // recommends for state derived from something outside it - an effect would
  // paint the stale value once before correcting it.
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q)
    setQDraft(filters.q)
  }

  // Typing used to write the URL on every keystroke, and every write refetched
  // the catalogue and dropped the whole grid to skeletons - eight requests and
  // eight flashes to type "concert", with the answers arriving out of order.
  // Now the URL is written once typing pauses, and one request follows.
  useEffect(() => {
    if (qDraft === filters.q) return
    const timer = setTimeout(() => update({ q: qDraft }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [qDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    getEvents(requestParams(filters, page))
      .then((data) => {
        if (!active) return
        const list = Array.isArray(data?.content) ? data.content : (Array.isArray(data) ? data : [])
        // The API serialises Page in snake_case; the camelCase spellings are
        // here for the same reason adapters.js carries both - one Jackson
        // setting is all that stands between the two, and reading only the
        // camel names silently pins the pager to a single page.
        const pages = Math.max(1, data?.total_pages ?? data?.totalPages ?? 1)
        setApiResults(list.map(mapEvent))
        setTotalCount(data?.total_elements ?? data?.totalElements ?? list.length)
        setTotalPages(pages)
        // The catalogue shrank under a page that no longer exists - Retry after
        // events were taken down. Without this the grid is empty and the pager
        // has already hidden itself, leaving no way back but Reset.
        if (page > pages) setPage(pages)
      })
      .catch(() => {
        // No mock fallback: seeded events standing in for a failed read looked
        // like a working catalogue and hid the outage completely.
        if (!active) return
        setApiResults([])
        setTotalCount(0)
        setTotalPages(1)
        setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [params, page, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(patch) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value == null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
    setPage(1)
  }

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
              {totalCount}{' '}
              {locale === 'km'
                ? 'ព្រឹត្តិការណ៍កំពុងលក់សំបុត្រ'
                : `${totalCount === 1 ? 'event' : 'events'} currently on sale`}
            </p>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- search bar */}
      <div className="panel searchpanel">
        <div className="panel-body">
          <div className="search-row">
            <SearchInput
              value={qDraft}
              onChange={setQDraft}
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
      ) : apiResults.length ? (
        <>
          <div className="grid grid-cards" style={{ marginTop: '1.4rem' }}>
            {apiResults.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
          <Pager page={page} pages={totalPages} onChange={setPage} />
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
