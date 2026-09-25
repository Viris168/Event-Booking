import { useState, useEffect } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import TicketWallet from '../components/TicketWallet.jsx'
import { BookingDetailSkeleton } from '../components/Skeleton.jsx'
import { Alert, Badge, ResponsiveTable, Steps } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { countdown, usd } from '../lib/format.js'

/** Which actions each of the eight booking states allows. */
function actionsFor(state) {
  return {
    // Mirrors PaymentService.PAYABLE on the server, which has always included
    // AWAITING_CONFIRMATION. Leaving it out here stranded anyone whose app
    // closed mid-payment: the booking was still payable, the button just was
    // not there. Re-opening the same provider returns the SAME QR rather than
    // charging twice, so offering it costs nothing.
    canPay: ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'PAYMENT_FAILED'].includes(state),
    // Only the LABEL differs there - not the weight. It was styled as a quiet
    // outline at first, on the reasoning that a payment really is in flight and
    // the poller may confirm it unaided. That reads backwards: anyone on this
    // page after a failed payment is there because something went wrong, and a
    // grey button is the one they scroll past.
    payIsResume: state === 'AWAITING_CONFIRMATION',
    canCancel: ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'PAYMENT_FAILED'].includes(state),
    hasTickets: state === 'CONFIRMED',
  }
}

const STATE_COPY = {
  PENDING_PAYMENT: {
    en: 'Waiting for your payment. The seats are held, not yours yet.',
    km: 'កំពុងរង់ចាំការបង់ប្រាក់។ កៅអីត្រូវបានកាន់ទុក ប៉ុន្តែមិនទាន់ជារបស់អ្នកទេ។',
  },
  AWAITING_CONFIRMATION: {
    en: 'Payment sent but the provider has not confirmed yet. We are still checking — or reopen it below to finish paying.',
    km: 'បានផ្ញើការបង់ប្រាក់ ប៉ុន្តែអ្នកផ្តល់សេវាមិនទាន់បញ្ជាក់។ យើងកំពុងពិនិត្យ ឬបើកម្តងទៀតដើម្បីបញ្ចប់ការទូទាត់។',
  },
  PAYMENT_FAILED: {
    en: 'The payment did not go through. You can start a new attempt while the hold lasts.',
    km: 'ការបង់ប្រាក់មិនបានសម្រេច។ អ្នកអាចព្យាយាមម្តងទៀត ខណៈពេលកក់នៅមាន។',
  },
  CONFIRMED: {
    en: 'Paid and confirmed. Show the QR at the door.',
    km: 'បានបង់ប្រាក់ និងបញ្ជាក់រួច។ សូមបង្ហាញ QR នៅមាត់ទ្វារ។',
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
  EXPIRED: 'warn',
  CANCELLED: 'warn',
}

import { getBooking as getApiBooking, cancelBooking } from '../api/bookings.js'
import { getBookingPayments } from '../api/payment.js'
import { mapBooking, mapTicket } from '../api/adapters.js'
import { getEvent as getApiEvent } from '../api/events.js'
import { mapEvent } from '../api/adapters.js'
import { getBookingTickets } from '../api/tickets.js'

export default function BookingDetailPage() {
  const { id } = useParams()
  const { t, locale, dateTime } = useLocale()
  const { user } = useAuth()
  const toast = useToast()

  const [apiBooking, setApiBooking] = useState(null)
  const [apiEvent, setApiEvent] = useState(null)
  const [apiTickets, setApiTickets] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(true)
  const [apiPayments, setApiPayments] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  // Guards both lifecycle buttons while a request is in flight. Cancel is not
  // undoable, so a double-click has to be impossible rather than merely
  // idempotent on the server.
  const [acting, setActing] = useState(false)

  /*
   * The open attempt's deadline, and how long is left on it.
   *
   * Shown beside the pay button because the button alone does not say the offer
   * is expiring: a customer who put their phone down mid-payment cannot tell
   * whether reopening is still worth doing, and the seats go back on sale when
   * it lapses.
   *
   * Derived here, above the loading early-returns, because the ticking effect
   * below is a hook and hooks cannot run conditionally.
   */
  const openAttempt = (apiPayments ?? []).find((p) =>
    ['PENDING', 'CREATED'].includes(p.status ?? p.state),
  )
  const expiresAt = apiBooking?.expires_at ?? apiBooking?.expiresAt ?? openAttempt?.expires_at ?? openAttempt?.expiresAt
  const msLeft = expiresAt ? Date.parse(expiresAt) - now : null

  // Ticks only while there is a live deadline on screen. An interval running on
  // a settled booking is a timer nothing reads.
  useEffect(() => {
    if (!expiresAt) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  useEffect(() => {
    let active = true
    getApiBooking(id)
      .then((res) => {
        if (active && res) {
          const mapped = mapBooking(res)
          setApiBooking(mapped)
          return getApiEvent(mapped.event_id)
        }
      })
      .then((res) => {
        if (active && res) setApiEvent(mapEvent(res))
      })
      .catch(() => {})
      .finally(() => {
        if (active) setBookingLoading(false)
      })
    return () => { active = false }
  }, [id])

  // Tickets and Payments are separate reads
  useEffect(() => {
    if (!apiBooking) return
    let active = true
    getBookingTickets(apiBooking.id)
      .then((res) => {
        if (active) setApiTickets((res || []).map(mapTicket))
      })
      .catch(() => {
        if (active) setApiTickets([])
      })
      
    getBookingPayments(apiBooking.id)
      .then((res) => {
        if (active) setApiPayments(res || [])
      })
      .catch(() => {
        if (active) setApiPayments([])
      })
    return () => { active = false }
  }, [apiBooking?.id, apiBooking?.state])

  const booking = apiBooking
  useDocumentTitle(booking?.booking_ref || null)

  if (bookingLoading) {
    return <BookingDetailSkeleton />
  }

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

  const event = apiEvent
  // The API nests venue on the event in camelCase; normalise to the
  // snake_case fields this page and TicketCard read.
  const apiVenue = event?.venue
  const venue = apiVenue && {
    ...apiVenue,
    name_en: apiVenue.nameEn ?? apiVenue.name_en,
    name_km: apiVenue.nameKm ?? apiVenue.name_km,
  }
  const items = booking.items || []
  const tickets = apiTickets ?? []
  const payments = apiPayments ?? []

  // The API has no endpoint for a booking's status-change history yet, so
  // this stays empty until one exists rather than showing something invented.
  const history = []
  const act = actionsFor(booking.state)
  const mine = booking.user_id === user?.id

  /**
   * Shared tail for both lifecycle actions. Each endpoint answers with the
   * updated booking, so the new state is adopted from the response instead of
   * refetching — and the tickets/payments effect below re-runs on the state
   * change, which is what repaints a cancelled booking's payment rows.
   */
  function applyBookingResult(res, message, tone = 'info') {
    setApiBooking(mapBooking(res))
    toast(message, tone)
  }

  function onActionError(err, fallback) {
    const data = err.response?.data
    // 409 means the state moved under us — a payment confirmed while this page
    // was open, or the window lapsed. The message names the actual states, so
    // it is more use to the customer than a generic failure.
    const detail = data?.detail || data?.message || err.message
    toast(`${fallback} (${detail})`, 'error')
  }

  function onCancel() {
    if (acting) return
    setActing(true)
    cancelBooking(booking.id)
      .then((res) =>
        applyBookingResult(
          res,
          locale === 'km' ? 'បានបោះបង់ការកក់' : 'Booking cancelled — those seats are back on sale.',
        ),
      )
      .catch((err) =>
        onActionError(err, locale === 'km' ? 'មិនអាចបោះបង់បានទេ' : 'Could not cancel this booking'),
      )
      .finally(() => setActing(false))
  }

  function labelForTicket(ticket) {
    // An API ticket already carries its seat location and tier, and labels
    // itself. Only the prototype store's tickets need this lookup.
    if (!ticket.booking_item_id) return undefined

    const item = items.find((i) => i.id === ticket.booking_item_id)
    if (!item) return '—'
    if (item.kind === 'SEAT') {
      return `${item.seat.section_label} · ${item.seat.row_label}${item.seat.seat_number}`
    }
    const zoneName = locale === 'km' ? item.zone.name_km : item.zone.name_en
    return `${zoneName} · #${ticket.unit_seq}`
  }

  // The gate reads a *whole booking* from any one of its codes — that is what
  // /tickets/scan/group/preview does — so the "group QR" is simply the first
  // still-unused ticket in the party, shown large on its own. Nothing extra is
  // minted for it, and a code that has already been through the scanner would
  // preview a party with itself missing, hence the filter.

  return (
    <div className="container">
      {act.hasTickets && (
        <Steps current={2} labels={[t('pickSeats'), t('checkoutPay'), t('yourTickets')]} />
      )}

      {/*
        No hold bar here. A booking exists precisely because its hold was
        converted, which leaves that hold CONSUMED - so a countdown on this page
        could only ever come from the prototype store, and the "Extend hold"
        button beside it called into that store and reported success against a
        hold the server had already closed. The extension lives on the event
        page, where the hold is still ACTIVE and extending it means something.
      */}
      {/* The extra space separates the title from the Steps bar above it. With
          no Steps it would only push the title below where every other page
          puts it. */}
      <div className="page-head" style={act.hasTickets ? { marginTop: '1rem' } : undefined}>
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
          {/* Opens /contact already filled in, so the one thing support will
              ask for first - which booking - is never the thing missing. An
              unsettled booking is almost always a payment question. */}
          <Link
            className="small with-icon"
            to={`/contact?${new URLSearchParams({
              topic: booking.state === 'CONFIRMED' ? 'BOOKING' : 'PAYMENT',
              ref: booking.booking_ref,
            })}`}
          >
            <Icon name="mail" size={14} />
            {locale === 'km' ? 'ត្រូវការជំនួយសម្រាប់ការកក់នេះ?' : 'Get help with this booking'}
          </Link>
        </div>
      </div>

      <Alert tone={TONE[booking.state]}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <span>{STATE_COPY[booking.state]?.[locale] || STATE_COPY[booking.state]?.en}</span>
          {msLeft !== null && msLeft > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
              <Icon name="clock" size={16} />
              {t('timeLeft', 'Time left:')} {countdown(msLeft)}
            </div>
          )}
        </div>
      </Alert>

      {mine && (act.canPay || act.canCancel) && (
        <div className="row" style={{ marginTop: '1rem' }}>
          {act.canPay && (
            <>
              <Link className="btn btn-accent btn-lg" to={`/checkout/${booking.id}/pay`}>
                <Icon name="card" size={16} />
                {act.payIsResume ? t('resumePayment') : t('payNow')} ·{' '}
                {usd(booking.total_usd_cents)}
              </Link>
              {msLeft != null && msLeft > 0 && (
                /* Turns urgent under a minute — that is the point at which
                   "later" stops being an option and the seats go back up. */
                <span className={`pay-countdown ${msLeft < 60_000 ? 'urgent' : ''}`}>
                  <Icon name="clock" size={14} />
                  {t('completeWithin')} {countdown(msLeft)}
                </span>
              )}
            </>
          )}
          {act.canCancel && (
            <button className="btn btn-danger" onClick={onCancel} disabled={acting}>
              {t('cancelBooking')}
            </button>
          )}
        </div>
      )}

      <div className="split" style={{ marginTop: '1.4rem' }}>
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>{t('yourTickets')}</h2>
              <div className="row" style={{ alignItems: 'center', gap: '0.75rem' }}>
                <span className="small muted">
                  {tickets.length} {locale === 'km' ? 'សំបុត្រ' : 'tickets'}
                </span>
              </div>
            </div>
            <div className="panel-body">
              {act.hasTickets && tickets.length ? (
                <div className="stack-sm">
                  {/* One code, made obvious. The gate resolves the whole
                      booking from any ticket on it, so six equal cards is six
                      things to thumb through at the one moment that is
                      expensive. The rest are one tap away. */}
                  <TicketWallet
                    tickets={tickets}
                    bookingRef={booking.booking_ref}
                    event={event}
                    venue={venue}
                    labelFor={labelForTicket}
                  />
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
            <ResponsiveTable>
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
                      <td className="num">{usd(p.amount_usd_cents)}</td>
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
</ResponsiveTable>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head">
              <h3>{t('orderSummary')}</h3>
            </div>
            <div className="panel-body">
              {items.map((item) => {
                // An API line carries a ready-made `label` (its seat class or
                // zone name); a prototype line carries the seat and zone objects
                // this page was originally written against.
                const title =
                  item.label ??
                  (item.kind === 'SEAT'
                    ? `${item.seat.section_label} · ${item.seat.row_label}${item.seat.seat_number}`
                    : locale === 'km'
                      ? item.zone.name_km
                      : item.zone.name_en)
                const sub =
                  item.kind === 'SEAT' && !item.label
                    ? locale === 'km'
                      ? item.seatClass?.name_km
                      : item.seatClass?.name_en
                    : `${item.qty} × ${usd(item.unit_price_usd_cents)}`

                return (
                  <div className="line" key={item.id}>
                    <span>
                      <span className="line-title">{title}</span>
                      <div className="line-sub">{sub}</div>
                    </span>
                    <span>{usd(item.unit_price_usd_cents * item.qty)}</span>
                  </div>
                )
              })}
              <div className="totals">
                <div className="total-row">
                  <span>{t('subtotal')}</span>
                  <span>{usd(booking.subtotal_usd_cents)}</span>
                </div>
                <div className="total-row big">
                  <span>{t('total')}</span>
                  <b>{usd(booking.total_usd_cents)}</b>
                </div>
                <p className="hint">{t('chargedInUsd')}</p>
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
                {/* No map pin on this one label. Four labels, one of them
                    iconed, reads as an oversight rather than emphasis - and
                    the row sits under a heading that already says what these
                    are. */}
                <dt>{locale === 'km' ? 'ទីកន្លែង' : 'Venue'}</dt>
                <dd>{(locale === 'km' ? venue?.name_km : venue?.name_en) || '—'}</dd>
              </dl>
            </div>
          </div>

          {/*
            Hidden rather than shown empty. `history` is always [] on a real
            booking - the server records every transition in
            booking_status_history but exposes no endpoint to read it back - so
            this rendered a titled card with a blank body on every live booking,
            which looks like the page failed to load rather than like there is
            nothing to show. It returns on its own once that endpoint exists.
          */}
          {history.length > 0 && (
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
          )}
        </div>
      </div>
    </div>
  )
}
