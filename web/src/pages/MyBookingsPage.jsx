import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { BookingListSkeleton, Skeleton } from '../components/Skeleton.jsx'
import { Badge, Empty, Money } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown } from '../lib/format.js'
import { getEvent, getHold, itemsOf, listBookings as mockListBookings, ticketsOf, useStore } from '../mock/store.js'
import { getMyBookings } from '../api/bookings.js'
import { getEvent as getApiEvent } from '../api/events.js'
import { getBookingTickets } from '../api/tickets.js'
import { mapBooking, mapEvent } from '../api/adapters.js'

/** States in which a booking has tickets worth counting. */
const TICKETED = ['CONFIRMED', 'REFUND_REQUESTED', 'REFUNDED']

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
  useStore()
  const { t, locale, status, dateTime, date } = useLocale()
  useDocumentTitle(t('myBookings'))
  const { user } = useAuth()
  const [state, setState] = useState('')
  const [apiBookings, setApiBookings] = useState(null)
  const [apiEvents, setApiEvents] = useState({})
  const [ticketCounts, setTicketCounts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (!user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    getMyBookings()
      .then((res) => {
        if (active && Array.isArray(res)) setApiBookings(res.map(mapBooking))
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [user?.id])

  // The list needs each booking's event for its title and date. The bookings
  // endpoint carries only event_id, so the events are fetched alongside -
  // deduplicated, because several bookings for one event are the normal case.
  useEffect(() => {
    if (!apiBookings?.length) return
    let active = true

    const ids = [...new Set(apiBookings.map((b) => b.event_id).filter(Boolean))]
    Promise.all(ids.map((id) => getApiEvent(id).then(mapEvent).catch(() => null)))
      .then((list) => {
        if (!active) return
        const byId = {}
        list.forEach((e) => { if (e) byId[e.id] = e })
        setApiEvents(byId)
      })

    // Ticket counts drive the "· N QR" badge. Only asked for where tickets can
    // exist: they are issued at payment, so an unpaid booking would just cost a
    // round trip to be told nothing.
    const ticketed = apiBookings.filter((b) => TICKETED.includes(b.state))
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
  }, [apiBookings])

  const all = apiBookings ?? mockListBookings({ userId: user.id })
  const bookings = state ? all.filter((b) => b.state === state) : all
  const counts = all.reduce((acc, b) => ({ ...acc, [b.state]: (acc[b.state] || 0) + 1 }), {})

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

      {/* The filter chips are built from the counts, so they wait for them. */}
      {!loading && (
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
      ) : bookings.length ? (
        <div className="stack-sm">
          {bookings.map((booking) => {
            // An API booking must never be looked up in the prototype store:
            // the ids belong to different databases, so a mock hit would show
            // another event's title and a miss would crash on event.title_km.
            const isApi = Boolean(apiBookings)

            const event = isApi ? apiEvents[booking.event_id] : getEvent(booking.event_id)
            const items = booking.items ?? itemsOf(booking.id)
            const ticketCount = isApi
              ? (ticketCounts[booking.id] ?? 0)
              : ticketsOf(booking.id).length

            // Only the prototype tracks a live hold clock here. On a real
            // booking the hold is already CONSUMED - what is ticking is the
            // payment window, which is not this badge.
            const hold = isApi ? null : getHold(booking.hold_id)
            const holdMsLeft =
              hold?.status === 'ACTIVE' ? new Date(hold.expires_at).getTime() - Date.now() : 0
            const units = items.reduce((a, i) => a + (i.qty ?? 0), 0)

            return (
              <Link key={booking.id} to={`/bookings/${booking.id}`} className="card">
                <div className="card-body">
                  <div className="spread">
                    <div className="flex-auto min-w-0">
                      <div className="row row-tight">
                        <Badge status={booking.state} />
                        <span className="mono small muted">{booking.booking_ref}</span>
                        {holdMsLeft > 0 && (
                          <span className="badge badge-warm">
                            <Icon name="clock" size={12} />
                            {countdown(holdMsLeft)}
                          </span>
                        )}
                      </div>
                      <div className="font-bold" style={{ marginTop: '0.35rem' }}>
                        {/* The event read can still be in flight, or have
                            failed; the booking ref above already identifies the
                            row, so an em dash beats blanking the card. */}
                        {(locale === 'km' ? event?.title_km : event?.title_en) ?? '—'}
                      </div>
                      <div className="meta-row">
                        <Icon name="calendar" size={14} />
                        <span>
                          {event?.starts_at ? `${dateTime(event.starts_at)} · ` : ''}{units}{' '}
                          {locale === 'km' ? 'ឯកតា' : units === 1 ? 'ticket' : 'tickets'}
                          {ticketCount ? ` · ${ticketCount} QR` : ''}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Money cents={booking.total_usd_cents} stacked />
                      <div className="small muted">
                        {locale === 'km' ? 'កក់ថ្ងៃ' : 'booked'} {date(booking.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <Empty icon="ticket" title={t('noBookings')}>
          <Link className="btn btn-sm btn-primary" to="/events" style={{ marginTop: '0.6rem' }}>
            {t('browseEvents')}
          </Link>
        </Empty>
      )}
    </div>
  )
}
