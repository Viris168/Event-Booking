import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import Icon from '../../components/Icon.jsx'
import { Badge, ResponsiveTable, TablePager } from '../../components/ui.jsx'
import { SkeletonRegion, TableRowsSkeleton } from '../../components/Skeleton.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import { getOrganizerTransactions, getOrganizerTransactionSummary } from '../../api/bookings.js'
import { getOrganizerEvents } from '../../api/events.js'

/** Money that actually landed. Everything else is an intention. */
const EARNING = new Set(['CONFIRMED'])

/*
 * Providers, named the way the table already names them.
 *
 * The row prints the provider of the booking's MOST RECENT attempt, and the
 * filter matches on exactly that - so a booking first tried on Bakong and
 * settled on ABA appears under ABA, which is what its own column says. The
 * server enforces that definition; see BookingRepository.findForOrganizer.
 */
const PROVIDER_LABEL = {
  BAKONG_KHQR: 'Bakong KHQR',
  ABA_PAYWAY: 'ABA PayWay',
}

const STATES = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'PAYMENT_FAILED',
]


export default function OrganizerTransactionsPage() {
  const { t, locale, date } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(km ? 'ប្រតិបត្តិការ' : 'Transactions')

  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [eventId, setEventId] = useState('')
  const [provider, setProvider] = useState('')
  const [sort, setSort] = useState('newest')
  const [showFilters, setShowFilters] = useState(false)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)

  // Both halves of this page now come from the server. While the dropdown read
  // the mock store, filtering by an event whose id existed only there returned
  // nothing - the two sources disagreed about which events were yours.
  const [events, setEvents] = useState([])
  useEffect(() => {
    getOrganizerEvents()
      .then(setEvents)
      .catch(() => setEvents([])) // the rows below report the failure already
  }, [])

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  /*
   * The heading's own figures, for the whole filtered set rather than the page.
   * Null until the first answer lands, so the heading can stay quiet instead of
   * flashing a confident zero on the way to the real number.
   */
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Paging and the state/event filters happen on the server. An organiser with
  // ten thousand bookings should not ship all of them to the browser so it can
  // display twenty-five - and the ownership rule belongs in the query anyway.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getOrganizerTransactions({
      page: page - 1, // Spring pages count from 0; this UI counts from 1
      size: pageSize,
      ...(state ? { state } : {}),
      ...(eventId ? { eventId } : {}),
      ...(provider ? { provider } : {}),
    })
      .then((data) => {
        if (cancelled) return
        setRows(data.content || [])
        setTotal(data.total_elements ?? 0)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.response?.status === 403 ? 'forbidden' : 'unreachable')
        setRows([])
        setTotal(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, pageSize, state, eventId, provider])

  /*
   * Deliberately not in the effect above: those deps include page and pageSize,
   * and paging through a result does not change what the result adds up to.
   */
  useEffect(() => {
    let cancelled = false
    getOrganizerTransactionSummary({
      ...(state ? { state } : {}),
      ...(eventId ? { eventId } : {}),
      ...(provider ? { provider } : {}),
    })
      .then((data) => !cancelled && setSummary(data))
      // The table below reports the failure; a heading that drops back to its
      // last known figures is better than a second error message.
      .catch(() => !cancelled && setSummary(null))
    return () => {
      cancelled = true
    }
  }, [state, eventId, provider])

  // Sort and text search act on the page in hand, because the endpoint offers
  // neither yet. That is a real limitation rather than a hidden one - the empty
  // state says "on this page" so a miss does not read as "you have none".
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = !needle
      ? rows
      : rows.filter((r) =>
          [r.booking_ref, r.buyer_name, r.buyer_phone_e164]
            .some((v) => (v || '').toLowerCase().includes(needle)),
        )
    const dir = {
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      highest: (a, b) => b.total_usd_cents - a.total_usd_cents,
      lowest: (a, b) => a.total_usd_cents - b.total_usd_cents,
    }[sort]
    return [...list].sort(dir)
  }, [rows, q, sort])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  // Narrowing a filter can strand you past the last page, which renders as an
  // empty table rather than as "no results".
  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [page, pageCount])

  const filtered = Boolean(q || state || eventId || provider)

  // Defined once and rendered by both the loaded table and its skeleton. Two
  // copies of this markup would be two things to keep in step, and a skeleton
  // whose columns have drifted from the real ones is worse than none.
  const tableHead = (
    <thead>
      <tr>
        <th>{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
        <th>{km ? 'ពេលវេលា' : 'Time'}</th>
        <th>{km ? 'អ្នកទិញ' : 'Customer'}</th>
        <th>{km ? 'វិធីបង់' : 'Method'}</th>
        <th>{km ? 'លេខយោង' : 'Reference'}</th>
        <th>{t('status')}</th>
        <th className="num">{km ? 'ចំនួនទឹកប្រាក់' : 'Amount'}</th>
      </tr>
    </thead>
  )

  return (
    <div className="container container-wide">
      {/* The page's title and figures sit outside the card, the same .page-head
          the dashboard, venues, check-in and payouts use. They were inside it,
          so this screen was a box with a heading rather than a page with a
          table on it. */}
      <div className="page-head">
        <div>
          <h1>{km ? 'ប្រតិបត្តិការ' : 'Transactions'}</h1>
          <p>
            {/* Both figures describe the filtered set, from the server. They
                used to be counted off `rows`, which is one page since paging
                moved server-side - so this line read "25 transactions" to an
                organiser looking at a table of six hundred.

                The money is printed only when the summary actually answered.
                Falling back to zero put "$0.00 settled" beside a real count -
                a confident figure for a number nobody had. */}
            {(summary?.count ?? total).toLocaleString()}{' '}
            {km ? 'ប្រតិបត្តិការ' : 'transactions'}
            {summary && (
              <>
                {' · '}
                <span className="text-success font-semibold">
                  {usd(summary.settled_usd_cents)}
                </span>{' '}
                {km ? 'បានទូទាត់' : 'settled'}
              </>
            )}
          </p>
        </div>
        <Link className="btn btn-primary" to="/organizer/events/new">
          <Icon name="plus" size={16} />
          {t('createEvent')}
        </Link>
      </div>

      <div className="bg-surface border border-line rounded-hero shadow-card overflow-hidden">

        {/* --------------------------------------------------------- toolbar */}
        <div className="px-5 py-3 border-b border-line-2 bg-surface-2 flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Icon
              name="search"
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              className="input pl-9 w-64"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder={km ? 'ស្វែងរកប្រតិបត្តិការ…' : 'Search transactions…'}
              aria-label={km ? 'ស្វែងរក' : 'Search transactions'}
            />
          </div>

          <select
            className="select w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={km ? 'តម្រៀប' : 'Sort'}
          >
            <option value="newest">{km ? 'ថ្មីបំផុត' : 'Newest'}</option>
            <option value="oldest">{km ? 'ចាស់បំផុត' : 'Oldest'}</option>
            <option value="highest">{km ? 'ទឹកប្រាក់ច្រើន' : 'Highest amount'}</option>
            <option value="lowest">{km ? 'ទឹកប្រាក់តិច' : 'Lowest amount'}</option>
          </select>

          <button
            type="button"
            /*
              * Two states, not three. Outlined at rest so it reads as a control
              * rather than as text that happens to be clickable, and solid
              * while the panel is open or a filter is set - both of those are
              * "this button is doing something", and splitting them across an
              * outline and a ghost made the difference a hairline nobody
              * notices.
              */
            className={`btn min-h-[42px] ${
              showFilters || filtered ? 'btn-primary' : 'btn-outline'
            }`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <Icon name="filter" size={15} />
            {km ? 'តម្រង' : 'Filters'}
            {/* The count rides in the label rather than in a pill: a badge
                borrowed from the table's own vocabulary sat on the green fill
                looking like a status, which is the one thing it is not. */}
            {filtered && ` · ${[q, state, eventId, provider].filter(Boolean).length}`}
          </button>

          {filtered && (
            <button
              type="button"
              className="btn btn-ghost min-h-[42px]"
              onClick={() => {
                setQ('')
                setState('')
                setEventId('')
                setProvider('')
                setPage(1)
              }}
            >
              {km ? 'សម្អាត' : 'Clear'}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="px-5 py-3 border-b border-line-2 flex items-end gap-3 flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-tiny font-semibold text-muted uppercase tracking-wide">{t('status')}</span>
              <select
                className="select w-auto"
                value={state}
                onChange={(e) => {
                  setState(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">{km ? 'ស្ថានភាពទាំងអស់' : 'All states'}</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-tiny font-semibold text-muted uppercase tracking-wide">
                {km ? 'ព្រឹត្តិការណ៍' : 'Event'}
              </span>
              <select
                className="select w-auto"
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">{km ? 'ព្រឹត្តិការណ៍ទាំងអស់' : 'All events'}</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {km ? e.title_km : e.title_en}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-tiny font-semibold text-muted uppercase tracking-wide">
                {km ? 'មធ្យោបាយបង់ប្រាក់' : 'Paid with'}
              </span>
              <select
                className="select w-auto"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">{km ? 'ទាំងអស់' : 'All providers'}</option>
                {Object.entries(PROVIDER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* ----------------------------------------------------------- table */}
        {loading ? (
          /* The real header over placeholder rows, rather than a centred
             "Loading…". The columns are then already at their final widths, so
             nothing shifts sideways when the ledger lands. */
          <SkeletonRegion
            className="overflow-x-auto"
            label={km ? 'កំពុងផ្ទុក…' : 'Loading transactions…'}
          >
            <table className="table">
              {tableHead}
              <TableRowsSkeleton
                rows={8}
                cols={7}
                cellClassName="px-[0.9rem] py-[0.7rem]"
                rowClassName="border-b border-line-2"
              />
            </table>
          </SkeletonRegion>
        ) : error ? (
          <div className="px-5 py-16 text-center">
            <Icon name="alert" size={28} className="text-danger" />
            <p className="text-ink font-semibold mt-3 mb-1">
              {error === 'forbidden'
                ? km ? 'អ្នកមិនមែនជាអ្នករៀបចំ' : 'Not an organizer account'
                : km ? 'មិនអាចទាក់ទងម៉ាស៊ីនបម្រើ' : 'Could not reach the server'}
            </p>
            {/* Naming the cause beats a generic failure: one of these is fixed by
                logging in as someone else, the other by starting the backend. */}
            <p className="text-small text-muted m-0">
              {error === 'forbidden'
                ? km ? 'គណនីនេះគ្មានទម្រង់អ្នករៀបចំ' : 'This account has no organizer profile.'
                : km ? 'សូមពិនិត្យថាម៉ាស៊ីនបម្រើកំពុងដំណើរការ' : 'Check that the API is running, then reload.'}
            </p>
          </div>
        ) : visible.length ? (
          <ResponsiveTable>
            <table className="table">
              {tableHead}
              <tbody className="text-small text-ink">
                {visible.map((r, i) => {
                  const earning = EARNING.has(r.state)
                  return (
                    <tr
                      key={r.booking_id}
                      /* Zebra from the surface token, so the stripe inverts with
                         the theme instead of staying light grey on dark. */
                      className={`border-b border-line-2 ${i % 2 ? 'bg-surface-2/40' : ''}`}
                    >
                      <td>
                        <Link className="font-semibold" to={`/organizer/events/${r.event_id}/sales`}>
                          {km ? r.event_title_km : r.event_title_en}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-medium text-ink">{date(r.created_at)}</div>
                        <div className="text-tiny text-muted">
                          {new Date(r.created_at).toLocaleTimeString(km ? 'km-KH' : 'en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{r.buyer_name}</div>
                        <div className="text-tiny text-muted">{r.buyer_phone_e164}</div>
                      </td>
                      <td>
                        {r.payment_provider ? (
                          /* The same wording as the filter above it. The raw
                             enum was printed here, so the control offered
                             "Bakong KHQR" and the column it filtered answered
                             "BAKONG_KHQR". */
                          <span className="badge badge-mode">
                            {PROVIDER_LABEL[r.payment_provider] ?? r.payment_provider}
                          </span>
                        ) : (
                          /* No attempt started yet - not the same as a failed one. */
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Link className="mono text-small" to={`/bookings/${r.booking_id}`}>
                          {r.booking_ref}
                        </Link>
                      </td>
                      <td>
                        <Badge status={r.state} />
                      </td>
                      <td
                        className={`num font-bold whitespace-nowrap ${
                          earning ? 'text-success' : 'text-muted'
                        }`}
                      >
                        {earning ? '+ ' : ''}
                        {usd(r.total_usd_cents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        ) : (
          <div className="px-5 py-16 text-center">
            <Icon name="wallet" size={28} className="text-muted" />
            <p className="text-ink font-semibold mt-3 mb-1">
              {km ? 'គ្មានប្រតិបត្តិការ' : 'No transactions'}
            </p>
            {/* Three different situations, three different answers. Search only
                narrows the page in hand, so saying so stops a miss reading as
                "this account has nothing". */}
            <p className="text-small text-muted m-0">
              {q
                ? km ? 'គ្មានលទ្ធផលក្នុងទំព័រនេះ' : 'No match on this page.'
                : state || eventId
                  ? km ? 'សាកល្បងលុបតម្រង' : 'Try clearing the filters.'
                  : km ? 'នៅមិនទាន់មានការកក់' : 'Nothing has been booked yet.'}
            </p>
          </div>
        )}

        {/* ------------------------------------------------------ pagination */}
        {/* The same bar the admin tables use. It is presentational, so it does
            not know that this page's pages come from the server while theirs
            are sliced in the browser - which is the point of it being shared. */}
        {!loading && !error && total > 0 && (
          <TablePager
            page={page}
            pages={pageCount}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        )}
      </div>
    </div>
  )
}
