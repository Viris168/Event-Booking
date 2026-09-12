import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import Icon from '../../components/Icon.jsx'
import { Badge } from '../../components/ui.jsx'
import { SkeletonRegion, TableRowsSkeleton } from '../../components/Skeleton.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import { getOrganizerTransactions } from '../../api/bookings.js'
import { getOrganizerEvents } from '../../api/events.js'

/** Money that actually landed. Everything else is an intention or a reversal. */
const EARNING = new Set(['CONFIRMED'])
/** Money going back out, so it reads as a negative rather than more income. */
const OUTGOING = new Set(['REFUNDED'])

const STATES = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'PAYMENT_FAILED',
  'REFUND_REQUESTED',
  'REFUNDED',
]

const PAGE_SIZES = [25, 50, 100]

export default function OrganizerTransactionsPage() {
  const { t, locale, date } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(km ? 'ប្រតិបត្តិការ' : 'Transactions')

  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [eventId, setEventId] = useState('')
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
  }, [page, pageSize, state, eventId])

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

  const settled = rows
    .filter((r) => EARNING.has(r.state))
    .reduce((a, r) => a + r.total_usd_cents, 0)

  const filtered = Boolean(q || state || eventId)

  // Defined once and rendered by both the loaded table and its skeleton. Two
  // copies of this markup would be two things to keep in step, and a skeleton
  // whose columns have drifted from the real ones is worse than none.
  const tableHead = (
    <thead>
      <tr className="bg-surface-2 border-b border-line text-tiny text-muted font-bold uppercase tracking-wide">
        <th className="px-5 py-3">{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
        <th className="px-5 py-3 whitespace-nowrap">{km ? 'ពេលវេលា' : 'Time'}</th>
        <th className="px-5 py-3">{km ? 'អ្នកទិញ' : 'Customer'}</th>
        <th className="px-5 py-3">{km ? 'វិធីបង់' : 'Method'}</th>
        <th className="px-5 py-3">{km ? 'លេខយោង' : 'Reference'}</th>
        <th className="px-5 py-3">{t('status')}</th>
        <th className="px-5 py-3 text-right whitespace-nowrap">
          {km ? 'ចំនួនទឹកប្រាក់' : 'Amount'}
        </th>
      </tr>
    </thead>
  )

  return (
    <div className="container container-wide">
      <div className="bg-surface border border-line rounded-hero shadow-card overflow-hidden">
        {/* ------------------------------------------------------------ head */}
        <div className="px-5 py-4 border-b border-line-2 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-ink m-0">{km ? 'ប្រតិបត្តិការទាំងអស់' : 'All transactions'}</h1>
            <p className="text-small text-muted m-0 mt-0.5">
              {/* The headline number describes the filtered view, not the
                  account - a total that ignored the filters would contradict
                  the rows directly beneath it. */}
              {rows.length.toLocaleString()} {km ? 'ប្រតិបត្តិការ' : 'transactions'} ·{' '}
              <span className="text-success font-semibold">{usd(settled)}</span>{' '}
              {km ? 'បានទូទាត់' : 'settled'}
            </p>
          </div>
          <Link className="btn btn-primary" to="/organizer/events/new">
            <Icon name="plus" size={16} />
            {t('createEvent')}
          </Link>
        </div>

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
            className={`btn btn-sm ${showFilters || filtered ? 'btn-outline' : 'btn-ghost'}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <Icon name="filter" size={15} />
            {km ? 'តម្រងបន្ថែម' : 'More filters'}
            {filtered && <span className="badge badge-mode ml-1">{[q, state, eventId].filter(Boolean).length}</span>}
          </button>

          {filtered && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setQ('')
                setState('')
                setEventId('')
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
            <table className="w-full text-left border-collapse">
              {tableHead}
              <TableRowsSkeleton
                rows={8}
                cols={7}
                cellClassName="px-5 py-3"
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              {tableHead}
              <tbody className="text-small text-ink">
                {visible.map((r, i) => {
                  const outgoing = OUTGOING.has(r.state)
                  const earning = EARNING.has(r.state)
                  return (
                    <tr
                      key={r.booking_id}
                      /* Zebra from the surface token, so the stripe inverts with
                         the theme instead of staying light grey on dark. */
                      className={`border-b border-line-2 ${i % 2 ? 'bg-surface-2/40' : ''}`}
                    >
                      <td className="px-5 py-3">
                        <Link className="font-semibold" to={`/organizer/events/${r.event_id}/sales`}>
                          {km ? r.event_title_km : r.event_title_en}
                        </Link>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-medium text-ink">{date(r.created_at)}</div>
                        <div className="text-tiny text-muted">
                          {new Date(r.created_at).toLocaleTimeString(km ? 'km-KH' : 'en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium">{r.buyer_name}</div>
                        <div className="text-tiny text-muted">{r.buyer_phone_e164}</div>
                      </td>
                      <td className="px-5 py-3">
                        {r.payment_provider ? (
                          <span className="badge badge-mode">{r.payment_provider}</span>
                        ) : (
                          /* No attempt started yet - not the same as a failed one. */
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Link className="mono text-small" to={`/bookings/${r.booking_id}`}>
                          {r.booking_ref}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge status={r.state} />
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap ${
                          outgoing ? 'text-refund' : earning ? 'text-success' : 'text-muted'
                        }`}
                      >
                        {outgoing ? '− ' : earning ? '+ ' : ''}
                        {usd(r.total_usd_cents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
        {!loading && !error && total > 0 && (
          <div className="px-5 py-3 border-t border-line-2 bg-surface-2 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-ui border border-line overflow-hidden bg-surface">
                {PAGE_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setPageSize(n)
                      setPage(1)
                    }}
                    aria-pressed={pageSize === n}
                    className={`px-3 py-1 text-small font-semibold border-r border-line last:border-r-0 ${
                      pageSize === n ? 'bg-brand-500 text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-small text-muted">{km ? 'ក្នុងមួយទំព័រ' : 'per page'}</span>
            </div>

            <div className="flex items-center gap-2 text-small text-muted">
              <span>
                {km ? 'ទំព័រ' : 'Page'} <b className="text-ink tabular-nums">{page}</b> {km ? 'នៃ' : 'of'}{' '}
                <b className="text-ink tabular-nums">{pageCount}</b>
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label={km ? 'ទំព័រមុន' : 'Previous page'}
              >
                <Icon name="chevronLeft" size={15} />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                aria-label={km ? 'ទំព័របន្ទាប់' : 'Next page'}
              >
                <Icon name="chevronRight" size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
