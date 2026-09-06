import { useEffect, useRef, useState } from 'react'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Badge, Empty, Progress, ResponsiveTable } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import {
  getOrganizerEvents,
  publishEvent,
  submitEventForReview,
  withdrawEventFromReview,
} from '../../api/events.js'
import { getMonthlyRevenue } from '../../api/bookings.js'

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
/**
 * Revenue for one event, from the response itself.
 *
 * Sold seats times their tier price, plus sold zone capacity times its price -
 * the same arithmetic the mock's salesSummary did, on data EventResponse
 * already carries. That is why the dashboard needed no summary endpoint: the
 * numbers were in the event payload the whole time.
 */
function revenueOf(event) {
  const fromSeats = (event.seat_classes || []).reduce(
    (a, c) => a + (c.sold_count || 0) * (c.price_usd_cents || 0), 0)
  const fromZones = (event.zones || []).reduce(
    (a, z) => a + (z.sold_qty || 0) * (z.price_usd_cents || 0), 0)
  return fromSeats + fromZones
}

export default function OrganizerDashboardPage() {
  const { t, locale, date } = useLocale()
  useDocumentTitle(t('organizerDashboard'))
  const { organizerProfile } = useAuth()

  const [events, setEvents] = useState([])
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Named so the row menu can re-run it after a transition: the status, the
  // available actions and the totals all change together, and refetching is
  // cheaper to reason about than patching one row in place.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getOrganizerEvents(), getMonthlyRevenue(12)])
      .then(([evts, revenue]) => {
        if (cancelled) return
        setEvents(evts || [])
        setMonths(revenue || [])
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.response?.status === 403 ? 'forbidden' : 'unreachable')
        setEvents([])
        setMonths([])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // capacity / sold / held come straight off EventResponse - the server already
  // sums seat classes and zones, so the old inventorySummary() lookup against
  // db.eventSeats has no job left.
  const totals = events.reduce(
    (acc, e) => ({
      revenue: acc.revenue + revenueOf(e),
      sold: acc.sold + (e.total_sold || 0),
      capacity: acc.capacity + (e.total_capacity || 0),
      held: acc.held + (e.total_held || 0),
    }),
    { revenue: 0, sold: 0, capacity: 0, held: 0 },
  )

  const peak = Math.max(...months.map((m) => m.cents), 1)
  const booked12 = months.reduce((a, m) => a + m.cents, 0)
  const avgTicket = totals.sold ? Math.round(totals.revenue / totals.sold) : 0

  // Ranked by money, not ticket count. Those orders disagree whenever prices
  // differ: a fun run selling 260 cheap tickets outranks a summit selling 84
  // expensive ones on volume while earning a fraction as much, and an organiser
  // reading "top events" is asking which ones pay.
  const byRevenue = events
    .map((e) => ({
      event: e,
      sold: e.total_sold || 0,
      capacity: e.total_capacity || 0,
      revenue: revenueOf(e),
    }))
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

      {error && (
        <div className="bg-surface border border-danger/30 rounded-card shadow-card p-6 text-center mb-4">
          <Icon name="alert" size={26} className="text-danger" />
          <p className="text-ink font-semibold mt-2 mb-1">
            {error === 'forbidden'
              ? km ? 'គណនីនេះមិនមែនជាអ្នករៀបចំ' : 'Not an organizer account'
              : km ? 'មិនអាចទាក់ទងម៉ាស៊ីនបម្រើ' : 'Could not reach the server'}
          </p>
          <p className="text-small text-muted m-0">
            {error === 'forbidden'
              ? km ? 'គណនីនេះគ្មានទម្រង់អ្នករៀបចំ' : 'This account has no organizer profile.'
              : km ? 'ពិនិត្យថា API កំពុងដំណើរការ' : 'Check that the API is running, then reload.'}
          </p>
        </div>
      )}

      {loading && !error && (
        <p className="text-small text-muted text-center py-10">
          {km ? 'កំពុងផ្ទុក…' : 'Loading…'}
        </p>
      )}

      <div className={`grid gap-4 lg:grid-cols-3 items-start ${loading || error ? 'hidden' : ''}`}>
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
                        title={`${MONTH_LABEL[m.month - 1]} ${m.year} · ${usd(m.cents)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-tiny text-muted font-medium mt-3">
                  {months.map((m, i) => (
                    <span key={i} className="flex-1 text-center">
                      {MONTH_LABEL[m.month - 1]}
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
                      const venue = e.venue
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
                              {e.total_sold} / {e.total_capacity}
                              {e.total_held ? <span className="muted"> · {e.total_held} held</span> : null}
                            </div>
                            <Progress sold={e.total_sold} held={e.total_held} capacity={e.total_capacity} />
                          </td>
                          <td className="num font-bold">{usd(revenueOf(e))}</td>
                          <td className="text-right">
                            <RowMenu event={e} onChanged={reload} />
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
            {/* Was "Checked in". Ticket scans live on the ticket tables and no
                endpoint exposes them yet, and a tile reading 0 would look like a
                quiet night rather than a missing feature. Held seats are real,
                come from the same payload, and are worth watching. */}
            <MiniStat
              icon="clock"
              value={totals.held.toLocaleString()}
              label={km ? 'កំពុងកក់ទុក' : 'Held now'}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * How each action is presented. Keyed by the transition name the server sends
 * in available_actions, so adding an edge server-side surfaces here as soon as
 * it has a label - and an unlabelled one is skipped rather than rendered raw.
 *
 * `danger` marks the moves that take an event off sale, so they can be styled
 * apart and pushed below a divider instead of sitting at the same weight as
 * "Edit".
 */
/**
 * Label and icon per transition. A presentation table, not a permission table -
 * the server decides which actions reach this page.
 */
const ACTION_UI = {
  SUBMIT: {
    icon: 'arrowRight', en: 'Submit for review', km: 'ដាក់ស្នើត្រួតពិនិត្យ',
    call: submitEventForReview,
  },
  WITHDRAW: {
    icon: 'arrowLeft', en: 'Withdraw', km: 'ដកសំណើវិញ',
    call: withdrawEventFromReview,
  },
  PUBLISH: {
    icon: 'check', en: 'Publish', km: 'ផ្សព្វផ្សាយ',
    call: publishEvent,
  },
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
function RowMenu({ event, onChanged }) {
  const { t, locale } = useLocale()
  const km = locale === 'km'
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // The server sends only what this caller may do, so there is no permission
  // rule here - just a guard against an action that has no label yet, which
  // renders nothing rather than a raw enum name.
  const actions = (event.available_actions || []).filter((a) => ACTION_UI[a])

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

          {/* Rendered from the server's own answer rather than guessed from the
              status. A two-state guess offered "Publish" on a REJECTED event,
              which the API refuses - and could never learn about a new edge. */}
          {actions.length > 0 && <div className="h-px bg-line-2 my-1" />}
          {actions.map((action) => {
            const ui = ACTION_UI[action]
            return (
              <button
                key={action}
                role="menuitem"
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-small text-left ${
                  ui.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2'
                }`}
                onClick={async () => {
                  setOpen(false)
                  try {
                    await ui.call(event.id)
                    onChanged()
                  } catch (e) {
                    // The server refuses transitions this menu should never have
                    // offered. Surfacing its message rather than a generic one
                    // means a disagreement between the two is visible instead of
                    // looking like a dead button.
                    toast(e?.response?.data?.detail || 'Action failed', 'danger')
                  }
                }}
              >
                <Icon name={ui.icon} size={15} className={ui.danger ? '' : 'text-muted'} />
                {km ? ui.km : ui.en}
              </button>
            )
          })}
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
