import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import Icon from '../../components/Icon.jsx'
import { Badge } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import { getEvent, latestPayment, listBookings, listEvents, useStore } from '../../mock/store.js'

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
  useStore()
  const { t, locale, date } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(km ? 'ប្រតិបត្តិការ' : 'Transactions')
  const { organizerProfile } = useAuth()
  const orgId = organizerProfile?.id || null

  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [eventId, setEventId] = useState('')
  const [sort, setSort] = useState('newest')
  const [showFilters, setShowFilters] = useState(false)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)

  const events = listEvents({ status: 'ALL', organizerId: orgId, sort: 'soonest' }).content
  const myEventIds = useMemo(() => new Set(events.map((e) => e.id)), [events])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = listBookings({ state, eventId: eventId || null })
      // listBookings has no organiser filter and returns every booking on the
      // platform. Without this an organiser sees other organisers' customers,
      // names and phone numbers. The server must repeat this check - a filter
      // in the browser is not a permission.
      .filter((b) => myEventIds.has(b.event_id))
      .filter((b) => {
        if (!needle) return true
        return (
          b.booking_ref.toLowerCase().includes(needle) ||
          (b.buyer_name || '').toLowerCase().includes(needle) ||
          (b.buyer_phone_e164 || '').includes(needle) ||
          (b.buyer_email || '').toLowerCase().includes(needle)
        )
      })
      .map((b) => ({ booking: b, payment: latestPayment(b.id), event: getEvent(b.event_id) }))

    const dir = {
      newest: (a, b) => new Date(b.booking.created_at) - new Date(a.booking.created_at),
      oldest: (a, b) => new Date(a.booking.created_at) - new Date(b.booking.created_at),
      highest: (a, b) => b.booking.total_usd_cents - a.booking.total_usd_cents,
      lowest: (a, b) => a.booking.total_usd_cents - b.booking.total_usd_cents,
    }[sort]
    return [...list].sort(dir)
  }, [q, state, eventId, sort, myEventIds])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  // Narrowing the filter can strand you on a page that no longer exists, which
  // renders as an empty table rather than as "no results".
  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [page, pageCount])
  const visible = rows.slice((page - 1) * pageSize, page * pageSize)

  const settled = rows.reduce((a, r) => a + (EARNING.has(r.booking.state) ? r.booking.total_usd_cents : 0), 0)
  const filtered = Boolean(q || state || eventId)

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
        {visible.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-line text-tiny text-muted font-bold uppercase tracking-wide">
                  <th className="px-5 py-3">{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                  <th className="px-5 py-3 whitespace-nowrap">{km ? 'ពេលវេលា' : 'Time'}</th>
                  <th className="px-5 py-3">{km ? 'អ្នកទិញ' : 'Customer'}</th>
                  <th className="px-5 py-3">{km ? 'វិធីបង់' : 'Method'}</th>
                  <th className="px-5 py-3">{km ? 'លេខយោង' : 'Reference'}</th>
                  <th className="px-5 py-3">{t('status')}</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap">{km ? 'ចំនួនទឹកប្រាក់' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody className="text-small text-ink">
                {visible.map(({ booking, payment, event }, i) => {
                  const outgoing = OUTGOING.has(booking.state)
                  const earning = EARNING.has(booking.state)
                  return (
                    <tr
                      key={booking.id}
                      /* Zebra from the surface token, so the stripe inverts with
                         the theme instead of staying a light grey on dark. */
                      className={`border-b border-line-2 ${i % 2 ? 'bg-surface-2/40' : ''}`}
                    >
                      <td className="px-5 py-3">
                        <Link className="font-semibold" to={`/organizer/events/${booking.event_id}/sales`}>
                          {km ? event?.title_km : event?.title_en}
                        </Link>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-medium text-ink">{date(booking.created_at)}</div>
                        <div className="text-tiny text-muted">
                          {new Date(booking.created_at).toLocaleTimeString(km ? 'km-KH' : 'en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium">{booking.buyer_name}</div>
                        <div className="text-tiny text-muted">{booking.buyer_phone_e164}</div>
                      </td>
                      <td className="px-5 py-3">
                        {payment ? (
                          <span className="badge badge-mode">{payment.provider}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Link className="mono text-small" to={`/bookings/${booking.id}`}>
                          {booking.booking_ref}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge status={booking.state} />
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap ${
                          outgoing ? 'text-refund' : earning ? 'text-success' : 'text-muted'
                        }`}
                      >
                        {outgoing ? '− ' : earning ? '+ ' : ''}
                        {usd(booking.total_usd_cents)}
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
            {/* A filtered-empty view and an empty account need different
                answers: one is "clear the filter", the other is "sell a ticket". */}
            <p className="text-small text-muted m-0">
              {filtered
                ? km
                  ? 'សាកល្បងលុបតម្រង'
                  : 'Try clearing the filters.'
                : km
                  ? 'នៅមិនទាន់មានការកក់'
                  : 'Nothing has been booked yet.'}
            </p>
          </div>
        )}

        {/* ------------------------------------------------------ pagination */}
        {rows.length > 0 && (
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
