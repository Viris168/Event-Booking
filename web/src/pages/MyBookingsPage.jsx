import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Badge, Empty, Money } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown } from '../lib/format.js'
import { getEvent, getHold, itemsOf, listBookings, ticketsOf, useStore } from '../mock/store.js'

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

  const all = listBookings({ userId: user.id })
  const bookings = state ? all.filter((b) => b.state === state) : all
  const counts = all.reduce((acc, b) => ({ ...acc, [b.state]: (acc[b.state] || 0) + 1 }), {})

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('myBookings')}</h1>
          <p>
            {all.length} {locale === 'km' ? 'ការកក់' : 'bookings'} ·{' '}
            {all.filter((b) => b.state === 'CONFIRMED').length} {status('CONFIRMED').toLowerCase()}
          </p>
        </div>
      </div>

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

      {bookings.length ? (
        <div className="stack-sm">
          {bookings.map((booking) => {
            const event = getEvent(booking.event_id)
            const items = itemsOf(booking.id)
            const tickets = ticketsOf(booking.id)
            const hold = getHold(booking.hold_id)
            const holdMsLeft =
              hold?.status === 'ACTIVE' ? new Date(hold.expires_at).getTime() - Date.now() : 0
            const units = items.reduce((a, i) => a + i.qty, 0)

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
                        {locale === 'km' ? event.title_km : event.title_en}
                      </div>
                      <div className="meta-row">
                        <Icon name="calendar" size={14} />
                        <span>
                          {dateTime(event.starts_at)} · {units}{' '}
                          {locale === 'km' ? 'ឯកតា' : units === 1 ? 'ticket' : 'tickets'}
                          {tickets.length ? ` · ${tickets.length} QR` : ''}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Money cents={booking.total_usd_cents} rate={booking.fx_rate_khr_per_usd} stacked />
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
