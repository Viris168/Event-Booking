import { Link, useParams } from 'react-router-dom'
import HoldBar from '../components/HoldBar.jsx'
import Icon from '../components/Icon.jsx'
import TicketCard from '../components/TicketCard.jsx'
import { Alert, Badge, Money, Steps } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usd } from '../lib/format.js'
import {
  cancelBooking,
  extendHold,
  getBooking,
  getEvent,
  getHold,
  getVenue,
  historyOf,
  itemsOf,
  paymentsForBooking,
  requestRefund,
  ticketsOf,
  useStore,
} from '../mock/store.js'

/** Which actions each of the eight booking states allows. */
function actionsFor(state) {
  return {
    canPay: ['PENDING_PAYMENT', 'PAYMENT_FAILED'].includes(state),
    canCancel: ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'PAYMENT_FAILED'].includes(state),
    canRefund: state === 'CONFIRMED',
    hasTickets: ['CONFIRMED', 'REFUND_REQUESTED', 'REFUNDED'].includes(state),
  }
}

const STATE_COPY = {
  PENDING_PAYMENT: {
    en: 'Waiting for your payment. The seats are held, not yours yet.',
    km: 'កំពុងរង់ចាំការបង់ប្រាក់។ កៅអីត្រូវបានកាន់ទុក ប៉ុន្តែមិនទាន់ជារបស់អ្នកទេ។',
  },
  AWAITING_CONFIRMATION: {
    en: 'Payment sent but the provider has not confirmed yet. We are checking; no action needed.',
    km: 'បានផ្ញើការបង់ប្រាក់ ប៉ុន្តែអ្នកផ្តល់សេវាមិនទាន់បញ្ជាក់។ យើងកំពុងពិនិត្យ។',
  },
  PAYMENT_FAILED: {
    en: 'The payment did not go through. You can start a new attempt while the hold lasts.',
    km: 'ការបង់ប្រាក់មិនបានសម្រេច។ អ្នកអាចព្យាយាមម្តងទៀត ខណៈពេលកក់នៅមាន។',
  },
  CONFIRMED: {
    en: 'Paid and confirmed. Show the QR at the door.',
    km: 'បានបង់ប្រាក់ និងបញ្ជាក់រួច។ សូមបង្ហាញ QR នៅមាត់ទ្វារ។',
  },
  REFUND_REQUESTED: {
    en: 'Refund requested — the organizer is reviewing it. Tickets stay valid until it is approved.',
    km: 'បានស្នើសុំសងប្រាក់វិញ — អ្នកចាត់ចែងកំពុងពិនិត្យ។ សំបុត្រនៅមានប្រសិទ្ធភាព។',
  },
  REFUNDED: {
    en: 'Refunded to the original payment method. These tickets are no longer valid.',
    km: 'បានសងប្រាក់វិញ។ សំបុត្រទាំងនេះលែងមានប្រសិទ្ធភាព។',
  },
  EXPIRED: {
    en: 'The hold expired before payment cleared, so the seats went back on sale.',
    km: 'ការកក់ផុតកំណត់មុនពេលបង់ប្រាក់ ដូច្នេះកៅអីត្រូវបានដាក់លក់វិញ។',
  },
  CANCELLED: {
    en: 'This booking was cancelled. Nothing was charged.',
    km: 'ការកក់នេះត្រូវបានបោះបង់។ គ្មានការកាត់ប្រាក់ទេ។',
  },
}

const TONE = {
  PENDING_PAYMENT: 'warn',
  AWAITING_CONFIRMATION: 'info',
  PAYMENT_FAILED: 'danger',
  CONFIRMED: 'success',
  REFUND_REQUESTED: 'info',
  REFUNDED: 'info',
  EXPIRED: 'warn',
  CANCELLED: 'warn',
}

export default function BookingDetailPage() {
  const { id } = useParams()
  useStore()
  const { t, locale, dateTime } = useLocale()
  const { user } = useAuth()
  const toast = useToast()

  const booking = getBooking(id)

  if (!booking) {
    return (
      <div className="container container-narrow">
        <Alert tone="danger" title="Booking not found">
          <Link to="/my-bookings" className="with-icon">
            <Icon name="arrowLeft" size={15} />
            {t('myBookings')}
          </Link>
        </Alert>
      </div>
    )
  }

  const event = getEvent(booking.event_id)
  const venue = getVenue(event.venue_id)
  const items = itemsOf(booking.id)
  const tickets = ticketsOf(booking.id)
  const payments = paymentsForBooking(booking.id)
  const history = historyOf(booking.id)
  const hold = getHold(booking.hold_id)
  const act = actionsFor(booking.state)
  const mine = booking.user_id === user?.id

  function labelForTicket(ticket) {
    const item = items.find((i) => i.id === ticket.booking_item_id)
    if (!item) return '—'
    if (item.kind === 'SEAT') {
      return `${item.seat.section_label} · ${item.seat.row_label}${item.seat.seat_number}`
    }
    const zoneName = locale === 'km' ? item.zone.name_km : item.zone.name_en
    return `${zoneName} · #${ticket.unit_seq}`
  }

  return (
    <div className="container">
      {act.hasTickets && (
        <Steps current={3} labels={[t('pickSeats'), t('checkout'), t('paymentMethod'), t('yourTickets')]} />
      )}

      {hold?.status === 'ACTIVE' && (
        <HoldBar hold={hold} onExtend={() => extendHold(hold.id)} />
      )}

      <div className="page-head" style={{ marginTop: '1rem' }}>
        <div>
          <div className="tiny">{t('bookingRef')}</div>
          <h1 className="mono" style={{ fontSize: '1.6rem' }}>
            {booking.booking_ref}
          </h1>
          <p>
            <Link to={`/events/${event.id}`}>{locale === 'km' ? event.title_km : event.title_en}</Link> ·{' '}
            {dateTime(event.starts_at)}
          </p>
        </div>
        <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
          <Badge status={booking.state} />
          <span className="small muted">
            {t('status')} · {dateTime(booking.state_changed_at)}
          </span>
        </div>
      </div>

      <Alert tone={TONE[booking.state]}>
        {STATE_COPY[booking.state]?.[locale] || STATE_COPY[booking.state]?.en}
      </Alert>

      {mine && (act.canPay || act.canCancel || act.canRefund) && (
        <div className="row" style={{ marginTop: '1rem' }}>
          {act.canPay && (
            <Link className="btn btn-accent" to={`/checkout/${booking.id}/pay`}>
              <Icon name="card" size={16} />
              {t('payNow')} · {usd(booking.total_usd_cents)}
            </Link>
          )}
          {act.canCancel && (
            <button
              className="btn btn-danger"
              onClick={() => {
                const r = cancelBooking(booking.id, user.id)
                toast(r.error ? r.error : locale === 'km' ? 'បានបោះបង់' : 'Booking cancelled', r.error ? 'error' : 'info')
              }}
            >
              {t('cancelBooking')}
            </button>
          )}
          {act.canRefund && (
            <button
              className="btn btn-outline"
              onClick={() => {
                const r = requestRefund(booking.id, user.id)
                toast(
                  r.error ? r.error : locale === 'km' ? 'បានស្នើសុំសងប្រាក់វិញ' : 'Refund requested',
                  r.error ? 'error' : 'success',
                )
              }}
            >
              {t('requestRefund')}
            </button>
          )}
        </div>
      )}

      <div className="split" style={{ marginTop: '1.4rem' }}>
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>{t('yourTickets')}</h2>
              <span className="small muted">
                {tickets.length} {locale === 'km' ? 'សំបុត្រ' : 'tickets'}
              </span>
            </div>
            <div className="panel-body">
              {act.hasTickets && tickets.length ? (
                <div className="stack-sm">
                  {booking.state === 'REFUNDED' && (
                    <Alert tone="warn">
                      {locale === 'km' ? 'សំបុត្រលែងមានប្រសិទ្ធភាព។' : 'These tickets have been voided by the refund.'}
                    </Alert>
                  )}
                  {tickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      label={labelForTicket(ticket)}
                      event={event}
                      venue={venue}
                    />
                  ))}
                </div>
              ) : (
                <p className="muted small">{t('ticketsAfterPayment')}</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{t('paymentHistory')}</h2>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('paymentMethod')}</th>
                    <th>{t('status')}</th>
                    <th>Ref</th>
                    <th className="num">{t('total')}</th>
                    <th>{locale === 'km' ? 'ដោះស្រាយ' : 'Resolved'}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.provider === 'BAKONG_KHQR' ? t('khqr') : t('payway')}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                      <td className="mono small">{p.provider_ref || '—'}</td>
                      <td className="num">
                        {p.currency_charged === 'KHR'
                          ? `៛${p.amount_khr.toLocaleString('en-US')}`
                          : usd(p.amount_usd_cents)}
                      </td>
                      <td className="small muted">{p.resolved_at ? dateTime(p.resolved_at) : '—'}</td>
                    </tr>
                  ))}
                  {!payments.length && (
                    <tr>
                      <td colSpan="5" className="muted small">
                        —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head">
              <h3>{t('orderSummary')}</h3>
            </div>
            <div className="panel-body">
              {items.map((item) => (
                <div className="line" key={item.id}>
                  <span>
                    <span className="line-title">
                      {item.kind === 'SEAT'
                        ? `${item.seat.section_label} · ${item.seat.row_label}${item.seat.seat_number}`
                        : locale === 'km'
                          ? item.zone.name_km
                          : item.zone.name_en}
                    </span>
                    <div className="line-sub">
                      {item.kind === 'SEAT'
                        ? locale === 'km'
                          ? item.seatClass?.name_km
                          : item.seatClass?.name_en
                        : `${item.qty} × ${usd(item.unit_price_usd_cents)}`}
                    </div>
                  </span>
                  <span>{usd(item.unit_price_usd_cents * item.qty)}</span>
                </div>
              ))}
              <div className="totals">
                <div className="total-row">
                  <span>{t('subtotal')}</span>
                  <span>{usd(booking.subtotal_usd_cents)}</span>
                </div>
                <div className="total-row big">
                  <span>{t('total')}</span>
                  <b>{usd(booking.total_usd_cents)}</b>
                </div>
                <div className="total-row">
                  <span className="small muted">KHR</span>
                  <span className="total-khr">៛{booking.total_khr.toLocaleString('en-US')}</span>
                </div>
                <p className="hint">
                  {t('fxNote')}: 1 USD = {Number(booking.fx_rate_khr_per_usd).toLocaleString('en-US')} KHR
                </p>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <div className="panel-head">
              <h3>{t('buyerDetails')}</h3>
            </div>
            <div className="panel-body">
              <dl className="kv">
                <dt>{t('fullName')}</dt>
                <dd>{booking.buyer_name}</dd>
                <dt>{t('phone')}</dt>
                <dd className="mono">{booking.buyer_phone_e164}</dd>
                <dt>{t('email')}</dt>
                <dd>{booking.buyer_email || '—'}</dd>
                <dt>
                  <span className="with-icon">
                    <Icon name="mapPin" size={14} />
                    {locale === 'km' ? 'ទីកន្លែង' : 'Venue'}
                  </span>
                </dt>
                <dd>{locale === 'km' ? venue.name_km : venue.name_en}</dd>
              </dl>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <div className="panel-head">
              <h3>{t('timeline')}</h3>
            </div>
            <div className="panel-body">
              <ul className="timeline">
                {history.map((h) => (
                  <li key={h.id}>
                    <div>
                      <b>{t('status')}: </b>
                      <Badge status={h.to_state} />
                      <div className="small muted">
                        {dateTime(h.changed_at)}
                        {h.note ? ` · ${h.note}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
