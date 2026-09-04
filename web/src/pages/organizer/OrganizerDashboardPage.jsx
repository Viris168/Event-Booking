import { useEffect, useRef, useState } from 'react'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Badge, Empty, Progress, ResponsiveTable } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import {
  getVenue,
  inventorySummary,
  listBookings,
  listEvents,
  salesSummary,
  setEventStatus,
  useStore,
} from '../../mock/store.js'

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Confirmed booking value per month, for the twelve months ending this one.
 *
 * Rolling rather than calendar-year: in January a year-to-date chart is one
 * bar and eleven blanks, which reads as broken rather than as early.
 *
 * This is deliberately NOT the same number as salesSummary's revenue. That one
 * is sold seats times price, taken from inventory state with no dates attached
 * - a lifetime total. This one is dated booking value, which is the only thing
 * that can be put on a time axis at all. They are labelled differently on the
 * page because they measure different things, and showing both as "revenue"
 * invites the reader to spot a discrepancy that is not one.
 */
function monthlyBooked(eventIds) {
  const now = new Date()
  const months = []
  for (let back = 11; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABEL[d.getMonth()], cents: 0 })
  }
  const index = new Map(months.map((m, i) => [`${m.year}-${m.month}`, i]))

  for (const b of listBookings({ state: 'CONFIRMED' })) {
    if (!eventIds.has(b.event_id)) continue
    const at = new Date(b.created_at)
    const i = index.get(`${at.getFullYear()}-${at.getMonth()}`)
    if (i !== undefined) months[i].cents += b.total_usd_cents
  }
  return months
}

export default function OrganizerDashboardPage() {
  useStore()
  const { t, locale, date } = useLocale()
  useDocumentTitle(t('organizerDashboard'))
  const { organizerProfile } = useAuth()
  const orgId = organizerProfile?.id || null

  const events = listEvents({ status: 'ALL', organizerId: orgId, sort: 'soonest' }).content
  const eventIds = new Set(events.map((e) => e.id))

  const totals = events.reduce(
    (acc, e) => {
      const s = salesSummary(e.id)
      return {
        revenue: acc.revenue + s.revenue_usd_cents,
        sold: acc.sold + s.sold,
        capacity: acc.capacity + s.capacity,
        checkedIn: acc.checkedIn + s.checkedIn,
      }
    },
    { revenue: 0, sold: 0, capacity: 0, checkedIn: 0 },
  )

  const months = monthlyBooked(eventIds)
  const peak = Math.max(...months.map((m) => m.cents), 1)
  const booked12 = months.reduce((a, m) => a + m.cents, 0)
  const avgTicket = totals.sold ? Math.round(totals.revenue / totals.sold) : 0

  // Ranked by money, not by ticket count. Those orders disagree whenever
  // prices differ: a fun run selling 260 cheap tickets can sit above a summit
  // selling 84 expensive ones on volume while earning a fraction as much, and
  // an organiser reading "top events" is asking which ones pay.
  const byRevenue = events
    .map((e) => ({ event: e, ...inventorySummary(e.id), revenue: salesSummary(e.id).revenue_usd_cents }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
  const revenuePeak = Math.max(...byRevenue.map((r) => r.revenue), 1)

  const km = locale === 'km'

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('organizerDashboard')}</h1>
          <p>
            {organizerProfile
              ? km
                ? organizerProfile.org_name_km
                : organizerProfile.org_name_en
              : km
                ? 'ព្រឹត្តិការណ៍ទាំងអស់'
                : 'All organizers'}
          </p>
        </div>
        <div className="row row-tight">
          <Link className="btn btn-outline" to="/organizer/venues">
            <Icon name="building" size={16} />
            {t('venues')}
          </Link>
          <Link className="btn btn-primary" to="/organizer/events/new">
            <Icon name="plus" size={16} />
            {t('createEvent')}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        {/* ------------------------------------------------ left, two columns */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* revenue over the year */}
          <section className="bg-surface border border-line rounded-card shadow-card p-5">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-muted text-small font-semibold m-0">
                  {km ? 'ការកក់បានបញ្ជាក់' : 'Confirmed bookings'}
                </h2>
                <div className="text-3xl font-black tracking-tight text-ink mt-1">{usd(booked12)}</div>
              </div>
              <span className="badge badge-mode">{km ? '១២ ខែចុងក្រោយ' : 'last 12 months'}</span>
            </div>

            {booked12 ? (
              <>
                <div className="flex items-end gap-1.5 h-32">
                  {months.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
                      <span className="text-tiny text-muted opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                        {usd(m.cents)}
                      </span>
                      <div
                        className="w-full bar-month rounded-t-tiny transition-all"
                        style={{ height: `${Math.max((m.cents / peak) * 100, m.cents ? 4 : 1)}%` }}
                        title={`${m.label} ${m.year} · ${usd(m.cents)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-tiny text-muted font-medium mt-3">
                  {months.map((m, i) => (
                    <span key={i} className="flex-1 text-center">
                      {m.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-small text-muted m-0 py-8 text-center">
                {km ? 'មិនទាន់មានការកក់ក្នុង១២ខែចុងក្រោយ' : 'No confirmed bookings in the last 12 months.'}
              </p>
            )}
          </section>

          {/* the events themselves */}
          <section className="bg-surface border border-line rounded-card shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-ink m-0">{t('myEvents')}</h2>
              <span className="text-small text-muted">
                {events.filter((e) => e.status === 'PUBLISHED').length} {km ? 'កំពុងផ្សាយ' : 'live'} ·{' '}
                {events.length} {km ? 'សរុប' : 'total'}
              </span>
            </div>

            {events.length ? (
              <ResponsiveTable>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                      <th>{t('status')}</th>
                      <th>{km ? 'កាលបរិច្ឆេទ' : 'Date'}</th>
                      <th style={{ minWidth: 160 }}>{t('ticketsSold')}</th>
                      <th className="num">{t('revenue')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const inv = inventorySummary(e.id)
                      const sales = salesSummary(e.id)
                      const venue = getVenue(e.venue_id)
                      return (
                        <tr key={e.id}>
                          <td>
                            <Link to={`/events/${e.id}`} className="font-bold">
                              {km ? e.title_km : e.title_en}
                            </Link>
                            <div className="small muted">
                              {km ? venue?.name_km : venue?.name_en} · {e.inventory_mode}
                            </div>
                          </td>
                          <td>
                            <Badge status={e.status} />
                          </td>
                          <td className="small">{date(e.starts_at)}</td>
                          <td>
                            <div className="small font-bold">
                              {inv.sold} / {inv.capacity}
                              {inv.held ? <span className="muted"> · {inv.held} held</span> : null}
                            </div>
                            <Progress sold={inv.sold} held={inv.held} capacity={inv.capacity} />
                          </td>
                          <td className="num font-bold">{usd(sales.revenue_usd_cents)}</td>
                          <td className="text-right">
                            <RowMenu event={e} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </ResponsiveTable>
            ) : (
              <Empty icon="calendar" title={km ? 'គ្មានព្រឹត្តិការណ៍' : 'No events yet'}>
                <Link className="btn btn-sm btn-primary" to="/organizer/events/new">
                  {t('createEvent')}
                </Link>
              </Empty>
            )}
          </section>
        </div>

        {/* ----------------------------------------------- right, one column */}
        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-line rounded-card shadow-card p-5">
            <h2 className="text-base font-bold text-ink m-0 mb-4">
              {km ? 'ចំណូលតាមព្រឹត្តិការណ៍' : 'Revenue by event'}
            </h2>
            {byRevenue.length ? (
              <div className="flex flex-col gap-3.5">
                {byRevenue.map(({ event, sold, capacity, revenue }, i) => (
                  <div key={event.id}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <Link to={`/organizer/events/${event.id}/sales`} className="text-small font-semibold truncate">
                        {km ? event.title_km : event.title_en}
                      </Link>
                      <span className="text-small font-bold text-ink whitespace-nowrap tabular-nums">
                        {usd(revenue)}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full bg-surface-2 overflow-hidden"
                      title={`${usd(revenue)} · ${sold}/${capacity} ${km ? 'សំបុត្រ' : 'tickets'}`}
                    >
                      <div
                        /* Colour is the rank, not the event: position 1 is
                           always bar-1, so the eye can compare lengths without
                           first decoding a legend. */
                        className={`h-full rounded-full bar-${i + 1}`}
                        style={{ width: `${(revenue / revenuePeak) * 100}%` }}
                      />
                    </div>
                    {/* Volume stays visible underneath: it is what explains a
                        short bar on a busy event, or a long one on a quiet one. */}
                    <div className="text-tiny text-muted mt-1 tabular-nums">
                      {sold.toLocaleString()} / {capacity.toLocaleString()} {km ? 'សំបុត្រ' : 'tickets'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-small text-muted m-0">{km ? 'មិនទាន់មានទិន្នន័យ' : 'Nothing sold yet.'}</p>
            )}
          </section>

          <div className="grid grid-cols-2 gap-4">
            <MiniStat icon="wallet" value={usd(totals.revenue)} label={km ? 'ចំណូលសរុប' : 'Lifetime revenue'} />
            <MiniStat icon="ticket" value={usd(avgTicket)} label={km ? 'តម្លៃមធ្យម' : 'Avg ticket'} />
            <MiniStat
              icon="calendar"
              value={totals.sold.toLocaleString()}
              label={km ? 'សំបុត្រលក់រួច' : 'Tickets sold'}
            />
            <MiniStat
              icon="scan"
              value={totals.checkedIn.toLocaleString()}
              label={km ? 'បានស្កេន' : 'Checked in'}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One gear per row instead of three buttons.
 *
 * Three visible buttons per row is nine controls on a nine-event table, and the
 * destructive one sat in the same weight as the others - a mis-click away from
 * pulling a live event. Folding them into a menu makes the row scannable and
 * puts a deliberate second step in front of the one action that cannot be
 * undone from here.
 */
function RowMenu({ event }) {
  const { t, locale } = useLocale()
  const km = locale === 'km'
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="w-8 h-8 rounded-ui border border-line bg-surface text-muted hover:text-ink hover:bg-surface-2 inline-flex items-center justify-center transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={km ? 'សកម្មភាព' : 'Actions'}
      >
        <Icon name="settingsSolid" size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-44 rounded-ui border border-line bg-surface shadow-float py-1 text-left"
        >
          <Link
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-small text-ink hover:bg-surface-2 no-underline"
            to={`/organizer/events/${event.id}/edit`}
            onClick={() => setOpen(false)}
          >
            <Icon name="edit" size={15} className="text-muted" />
            {t('editEvent')}
          </Link>
          <Link
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-small text-ink hover:bg-surface-2 no-underline"
            to={`/organizer/events/${event.id}/sales`}
            onClick={() => setOpen(false)}
          >
            <Icon name="chart" size={15} className="text-muted" />
            {t('sales')}
          </Link>
          <Link
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-small text-ink hover:bg-surface-2 no-underline"
            to={`/events/${event.id}`}
            onClick={() => setOpen(false)}
          >
            <Icon name="eye" size={15} className="text-muted" />
            {km ? 'មើលទំព័រសាធារណៈ' : 'View public page'}
          </Link>

          {/* TODO: drive these from event.available_actions once the review
              endpoints land. A two-state guess offers "Publish" on a REJECTED
              event, which the server now refuses. */}
          {(event.status === 'PUBLISHED' || event.status === 'DRAFT') && (
            <>
              <div className="h-px bg-line-2 my-1" />
              {event.status === 'PUBLISHED' ? (
                <button
                  role="menuitem"
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-small text-danger hover:bg-danger-soft text-left"
                  onClick={() => {
                    setEventStatus(event.id, 'TAKEN_DOWN')
                    setOpen(false)
                  }}
                >
                  <Icon name="minus" size={15} />
                  {t('unpublish')}
                </button>
              ) : (
                <button
                  role="menuitem"
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-small text-ink hover:bg-surface-2 text-left"
                  onClick={() => {
                    setEventStatus(event.id, 'PUBLISHED')
                    setOpen(false)
                  }}
                >
                  <Icon name="check" size={15} className="text-success" />
                  {t('publish')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Number first, label under it, icon quiet in the corner. */
function MiniStat({ icon, value, label }) {
  return (
    <div className="bg-surface border border-line rounded-card shadow-card p-4 flex flex-col justify-between gap-5">
      <div className="text-xl font-bold tracking-tight text-ink tabular-nums">{value}</div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-tiny text-muted font-medium leading-tight">{label}</span>
        <span className="w-8 h-8 rounded-full bg-surface-2 border border-line-2 flex items-center justify-center text-muted shrink-0">
          <Icon name={icon} size={15} />
        </span>
      </div>
    </div>
  )
}
