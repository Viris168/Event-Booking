import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon, { CATEGORY_ICON } from '../components/Icon.jsx'
import { BookingListSkeleton, Skeleton } from '../components/Skeleton.jsx'
import { Badge, Empty, Money } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { eventArt } from '../lib/eventArt.js'
import { getMyBookings } from '../api/bookings.js'
import { getEvent as getApiEvent } from '../api/events.js'
import { getBookingTickets } from '../api/tickets.js'
import { mapBooking, mapEvent } from '../api/adapters.js'

/** States in which a booking has tickets worth counting. */
const TICKETED = ['CONFIRMED', 'REFUND_REQUESTED', 'REFUNDED']

/**
 * States the buyer can still act on, mirroring PaymentService.PAYABLE on the
 * server. Surfacing these as a button on the row is the point of this page:
 * an unpaid booking is the one thing here that expires if ignored.
 */
const PAYABLE = ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'PAYMENT_FAILED']

/** Dead states — kept visible for the record, but styled as spent. */
const CLOSED = ['EXPIRED', 'CANCELLED', 'REFUNDED']

const STATES = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'REFUND_REQUESTED',
  'REFUNDED',
  'EXPIRED',
  'CANCELLED',
]

export default function MyBookingsPage() {
  const { t, locale, status, dateTime, date } = useLocale()
  useDocumentTitle(t('myBookings'))
  const { user } = useAuth()
  const [state, setState] = useState('')
  const [bookingsData, setBookingsData] = useState([])
  const [apiEvents, setApiEvents] = useState({})
  const [ticketCounts, setTicketCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    if (!user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setFailed(false)
    getMyBookings()
      .then((res) => {
        if (!active) return
        setBookingsData(Array.isArray(res) ? res.map(mapBooking) : [])
      })
      .catch(() => {
        // Previously swallowed, which quietly fell through to the prototype
        // store — the page then showed someone else's seeded bookings as if
        // they were yours.
        if (!active) return
        setBookingsData([])
        setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [user?.id, reload])

  // Each row needs its event for the title, date and artwork. The bookings
  // endpoint carries only event_id, so events are fetched alongside —
  // deduplicated, because several bookings for one event are the normal case.
  // Line items already arrive inline, so those cost no extra request.
  useEffect(() => {
    if (!bookingsData.length) return
    let active = true

    const ids = [...new Set(bookingsData.map((b) => b.event_id).filter(Boolean))]
    Promise.all(ids.map((id) => getApiEvent(id).then(mapEvent).catch(() => null)))
      .then((list) => {
        if (!active) return
        const byId = {}
        list.forEach((e) => { if (e) byId[e.id] = e })
        setApiEvents(byId)
      })

    // Ticket counts drive the "N QR" badge. Only asked for where tickets can
    // exist: they are issued at payment, so an unpaid booking would just cost a
    // round trip to be told nothing.
    const ticketed = bookingsData.filter((b) => TICKETED.includes(b.state))
    Promise.all(
      ticketed.map((b) =>
        getBookingTickets(b.id)
          .then((ts) => [b.id, (ts || []).length])
          .catch(() => [b.id, 0]),
      ),
    ).then((pairs) => {
      if (active) setTicketCounts(Object.fromEntries(pairs))
    })

    return () => { active = false }
  }, [bookingsData])

  const all = bookingsData
  const counts = all.reduce((acc, b) => ({ ...acc, [b.state]: (acc[b.state] || 0) + 1 }), {})
  const filtered = state ? all.filter((b) => b.state === state) : all

  /**
   * Split by whether the event has happened, then sort each half towards the
   * present: the next thing you must show up for sits at the top, and the
   * archive reads newest-first below it.
   *
   * An event still loading has no date yet; those sort as upcoming rather than
   * dropping into the archive and appearing to vanish.
   */
  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const up = []
    const done = []
    for (const b of filtered) {
      const startsAt = apiEvents[b.event_id]?.starts_at
      const ts = startsAt ? new Date(startsAt).getTime() : null
      if (ts != null && ts < now) done.push([b, ts])
      else up.push([b, ts ?? Number.MAX_SAFE_INTEGER])
    }
    up.sort((a, z) => a[1] - z[1])
    done.sort((a, z) => z[1] - a[1])
    return { upcoming: up.map(([b]) => b), past: done.map(([b]) => b) }
  }, [filtered, apiEvents])

  function Row({ booking }) {
    const event = apiEvents[booking.event_id]
    const items = booking.items ?? []
    const ticketCount = ticketCounts[booking.id] ?? 0
    const units = items.reduce((a, i) => a + (i.qty ?? 0), 0)
    const art = eventArt(event, 'cover')
    const payable = PAYABLE.includes(booking.state)
    const closed = CLOSED.includes(booking.state)

    return (
      <Link
        to={`/bookings/${booking.id}`}
        className={`bk-row${closed ? ' is-closed' : ''}${payable ? ' is-payable' : ''}`}
      >
        {/* Same artwork resolution as the event cards, so a booking is
            recognisable by the picture you bought it from. */}
        <span className={`bk-art ${art.className}${art.hasImage ? ' has-photo' : ''}`}>
          {art.hasImage ? (
            <img
              className="ev-photo"
              src={art.url}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(e) => { e.currentTarget.remove() }}
            />
          ) : (
            <Icon
              name={CATEGORY_ICON[event?.category] || 'ticket'}
              size={22}
              strokeWidth={1.5}
              className="cat-icon"
            />
          )}
        </span>

        <span className="bk-main">
          <span className="row row-tight">
            <Badge status={booking.state} />
            <span className="mono small muted">{booking.booking_ref}</span>
          </span>

          {/* The event read can still be in flight, or have failed; the ref
              above already identifies the row, so an em dash beats blanking. */}
          <span className="bk-title">
            {(locale === 'km' ? event?.title_km : event?.title_en) ?? '—'}
          </span>

          <span className="bk-meta">
            <span className="meta-row">
              <Icon name="calendar" size={14} />
              <span>{event?.starts_at ? dateTime(event.starts_at) : '—'}</span>
            </span>
            <span className="meta-row">
              <Icon name="ticket" size={14} />
              <span>
                {units} {locale === 'km' ? 'ឯកតា' : units === 1 ? 'ticket' : 'tickets'}
                {ticketCount ? ` · ${ticketCount} QR` : ''}
              </span>
            </span>
          </span>
        </span>

        <span className="bk-side">
          <Money cents={booking.total_usd_cents} stacked />
          <span className="small muted">
            {locale === 'km' ? 'កក់ថ្ងៃ' : 'booked'} {date(booking.created_at)}
          </span>
          {payable && (
            <span className="btn btn-sm btn-accent bk-pay">
              {locale === 'km' ? 'បង់ប្រាក់' : 'Pay now'}
              <Icon name="arrowRight" size={13} />
            </span>
          )}
        </span>
      </Link>
    )
  }

  function Group({ title, list }) {
    if (!list.length) return null
    return (
      <div className="bk-group">
        <div className="bk-group-head">
          <span>{title}</span>
          <span className="bk-group-count">{list.length}</span>
        </div>
        <div className="stack-sm">
          {list.map((b) => <Row key={b.id} booking={b} />)}
        </div>
      </div>
    )
  }

  // Signed out: nothing to fetch, and an empty "no bookings" state would be a
  // lie — the bookings may well exist, just not for an anonymous caller.
  if (!user?.id) {
    return (
      <div className="container">
        <div className="page-head"><h1>{t('myBookings')}</h1></div>
        <Empty icon="user" title={locale === 'km' ? 'សូមចូលគណនី' : 'Sign in to see your bookings'}>
          <Link className="btn btn-sm btn-primary" to="/login" style={{ marginTop: '0.6rem' }}>
            {t('login')}
          </Link>
        </Empty>
      </div>
    )
  }

  const payableCount = all.filter((b) => PAYABLE.includes(b.state)).length

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('myBookings')}</h1>
          {loading ? (
            <Skeleton className="skel-line mt-2 w-48" />
          ) : (
            <p>
              {all.length} {locale === 'km' ? 'ការកក់' : 'bookings'} ·{' '}
              {all.filter((b) => b.state === 'CONFIRMED').length} {status('CONFIRMED').toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {/* Unpaid bookings expire. That is the one thing on this page worth
          interrupting for, so it sits above the filters rather than being
          something you have to notice among the rows. */}
      {!loading && !failed && payableCount > 0 && (
        <div className="bk-alert">
          <Icon name="clock" size={16} />
          <span>
            {locale === 'km'
              ? `អ្នកមានការកក់ ${payableCount} រង់ចាំការបង់ប្រាក់។`
              : `${payableCount} booking${payableCount === 1 ? '' : 's'} awaiting payment — these expire if left unpaid.`}
          </span>
          <button className="btn btn-sm btn-outline" onClick={() => setState('PENDING_PAYMENT')}>
            {locale === 'km' ? 'មើល' : 'Show'}
          </button>
        </div>
      )}

      {!loading && !failed && all.length > 0 && (
        <div className="chips" style={{ marginBottom: '1.1rem' }}>
          <button className={`chip ${!state ? 'active' : ''}`} onClick={() => setState('')}>
            {t('allStatuses')} ({all.length})
          </button>
          {STATES.filter((s) => counts[s]).map((s) => (
            <button key={s} className={`chip ${state === s ? 'active' : ''}`} onClick={() => setState(s)}>
              {status(s)} ({counts[s]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <BookingListSkeleton count={3} />
      ) : failed ? (
        <Empty
          icon="xCircle"
          title={locale === 'km' ? 'មិនអាចផ្ទុកការកក់' : 'Could not load your bookings'}
        >
          {locale === 'km'
            ? 'សូមព្យាយាមម្តងទៀត។'
            : 'Your bookings are unavailable right now. Please try again.'}
          <button
            className="btn btn-sm btn-primary"
            style={{ marginTop: '0.8rem' }}
            onClick={() => setReload((n) => n + 1)}
          >
            <Icon name="refresh" size={14} />
            {locale === 'km' ? 'ព្យាយាមម្តងទៀត' : 'Retry'}
          </button>
        </Empty>
      ) : filtered.length ? (
        <>
          <Group title={locale === 'km' ? 'ជិតមកដល់' : 'Upcoming'} list={upcoming} />
          <Group title={locale === 'km' ? 'កន្លងផុត' : 'Past'} list={past} />
        </>
      ) : (
        <Empty icon="ticket" title={t('noBookings')}>
          {state && (
            <button
              className="btn btn-sm btn-outline"
              style={{ marginTop: '0.6rem', marginRight: '0.4rem' }}
              onClick={() => setState('')}
            >
              {t('allStatuses')}
            </button>
          )}
          <Link className="btn btn-sm btn-primary" to="/events" style={{ marginTop: '0.6rem' }}>
            {t('browseEvents')}
          </Link>
        </Empty>
      )}
    </div>
  )
}
