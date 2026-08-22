import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import HoldBar from '../components/HoldBar.jsx'
import Icon from '../components/Icon.jsx'
import PaywayCheckout from '../components/PaywayCheckout.jsx'
import { Alert, Badge, ResponsiveTable, Steps } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown, usd } from '../lib/format.js'
import {
  MERCHANT_ID,
  MERCHANT_NAME,
  PROVIDER,
  createTransaction,
  loadTransaction,
  optionTitle,
  paymentOption,
  settleTransaction,
} from '../lib/payway.js'
import {
  extendHold,
  getBooking,
  getEvent as mockGetEvent,
  getHold,
  itemsOf,
  resolvePayment,
  startPayment,
  useStore,
} from '../mock/store.js'
import { getEvent } from '../api/events.js'
import { mapBooking, mapEvent } from '../api/adapters.js'
import { getBooking as getApiBooking } from '../api/bookings.js'

// How each PayWay payment_status reads on screen.
const STRIP = {
  PENDING: { tone: 'wait', key: 'waitingForPayment' },
  APPROVED: { tone: 'ok', key: 'paymentReceived' },
  DECLINED: { tone: 'bad', key: 'paymentFailedMsg' },
  CANCELLED: { tone: 'neutral', key: 'paymentCancelled' },
  EXPIRED: { tone: 'neutral', key: 'transactionExpired' },
}

/**
 * The merchant side of PayWay's eCommerce checkout.
 *
 * It creates the transaction, opens PayWay's checkout in the view the buyer
 * chose (popup / bottom sheet, or the hosted page inline), then does what the
 * merchant server does once the buyer is done: run Check Transaction until the
 * status is final, and treat the return_url callback as the result of record.
 */
export default function PaymentPage() {
  const { bookingId } = useParams()
  const [params] = useSearchParams()
  useStore()
  const { t, locale, dateTime } = useLocale()
  const navigate = useNavigate()

  const [apiEvent, setApiEvent] = useState(null)
  const [apiBooking, setApiBooking] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(true)

  const [txn, setTxn] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [checking, setChecking] = useState(false) // Check Transaction in flight
  const [polls, setPolls] = useState(0)
  const [now, setNow] = useState(() => Date.now()) // drives the lifetime countdown
  const onSettledRef = useRef(() => {})

  useEffect(() => {
    let active = true
    getApiBooking(bookingId)
      .then((res) => {
        if (active && res) {
          const mapped = mapBooking(res)
          setApiBooking(mapped)
          return getEvent(mapped.event_id)
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
  }, [bookingId])

  // Only the pure-prototype path has a mock booking; an API booking id must
  // never be used to write into the seeded store.
  const mockBooking = !bookingLoading && !apiBooking ? getBooking(bookingId) : null
  const booking = apiBooking ?? mockBooking
  const event = apiEvent ?? (mockBooking ? mockGetEvent(mockBooking.event_id) : null)
  const hold = booking ? getHold(booking.hold_id) : null
  useDocumentTitle(booking ? `${t('checkout')} · ${booking.booking_ref}` : null)

  const viewType = params.get('view') === 'hosted_view' ? 'hosted_view' : 'popup'
  const requestedOption = params.get('option')

  // With no attempt in hand the booking's own state says how the last one ended.
  const status =
    txn?.status ||
    { CONFIRMED: 'APPROVED', PAYMENT_FAILED: 'DECLINED', CANCELLED: 'CANCELLED' }[booking?.state] ||
    'PENDING'

  /** Create Transaction — one open purchase per booking. */
  const openTransaction = useCallback(
    (option) => {
      if (!booking) return
      const next = createTransaction({
        bookingId: booking.id,
        bookingRef: booking.booking_ref,
        option,
        viewType,
        amountUsdCents: booking.total_usd_cents,
        returnUrl: `${window.location.origin}/checkout/${booking.id}/pay`,
      })
      // Mirror the attempt onto the booking so the rest of the prototype — the
      // booking state machine, the admin payment views — sees it too.
      if (mockBooking) startPayment(mockBooking.id, PROVIDER)
      setTxn(next)
      setPolls(0)
      setChecking(false)
      setSheetOpen(true)
    },
    [booking, mockBooking, viewType],
  )

  // Pick up an attempt left open by an earlier visit, or start the one the
  // checkout page asked for.
  useEffect(() => {
    if (!booking || txn) return
    const existing = loadTransaction(booking.id)
    if (existing) {
      setTxn(existing)
      setSheetOpen(existing.status === 'PENDING')
    } else if (booking.state === 'PENDING_PAYMENT' || !booking.state) {
      openTransaction(requestedOption || undefined)
    }
  }, [booking, txn, requestedOption, openTransaction])

  // Check Transaction: poll until the gateway gives a final answer.
  useEffect(() => {
    if (!checking) return
    const timer = setInterval(() => setPolls((n) => n + 1), 900)
    const done = setTimeout(() => setChecking(false), 2200)
    return () => {
      clearInterval(timer)
      clearTimeout(done)
    }
  }, [checking])

  // A purchase only lives for its `lifetime`; past that PayWay stops accepting it.
  useEffect(() => {
    if (txn?.status !== 'PENDING') return
    const tick = setInterval(() => {
      setNow(Date.now())
      if (Date.parse(txn.expires_at) <= Date.now()) onSettledRef.current('EXPIRED')
    }, 1000)
    return () => clearInterval(tick)
  }, [txn?.status, txn?.expires_at])

  // Once the money lands, move on to the tickets.
  useEffect(() => {
    if (status !== 'APPROVED' || checking) return
    const timer = setTimeout(() => navigate(`/bookings/${booking.id}`), 1600)
    return () => clearTimeout(timer)
  }, [status, checking, booking?.id, navigate])

  /** The buyer finished inside the checkout — PayWay closes it and posts back. */
  const onSettled = useCallback(
    (status) => {
      if (!booking) return
      const settled = settleTransaction(booking.id, status)
      setTxn(settled)
      setSheetOpen(false)
      setChecking(true)
      setPolls(0)
      if (mockBooking) {
        // EXPIRED closes the attempt but leaves the booking payable, so it maps
        // straight through rather than onto a cancellation.
        resolvePayment(
          mockBooking.id,
          { APPROVED: 'SUCCESS', DECLINED: 'FAILED', CANCELLED: 'CANCELLED', EXPIRED: 'EXPIRED' }[
            status
          ],
        )
      }
    },
    [booking, mockBooking],
  )
  onSettledRef.current = onSettled

  // PayWay's `items`: descriptive lines shown inside the checkout.
  const items = useMemo(() => {
    const lines = apiBooking?.items?.length
      ? apiBooking.items
      : mockBooking
        ? itemsOf(mockBooking.id)
        : []
    return lines.map((i) => ({
      name: i.event_seat_id || i.seat || i.kind === 'SEAT' ? t('seatTicket') : t('generalAdmission'),
      quantity: i.qty ?? 1,
      priceUsdCents: i.unit_price_usd_cents ?? 0,
    }))
  }, [apiBooking, mockBooking, t])

  if (bookingLoading) {
    return <div className="p-12 text-center text-muted">Loading checkout...</div>
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

  const strip = STRIP[status] || STRIP.PENDING
  const isOpen = status === 'PENDING'
  const option = paymentOption(txn?.payment_option)
  const hosted = viewType === 'hosted_view'

  const checkout = txn ? (
    <PaywayCheckout
      txn={txn}
      mode={hosted ? 'hosted' : 'popup'}
      merchant={MERCHANT_NAME}
      items={items}
      onSettled={onSettled}
      onClose={() => setSheetOpen(false)}
    />
  ) : null

  return (
    <div className="container">
      <Steps current={1} labels={[t('pickSeats'), t('checkoutPay'), t('yourTickets')]} />

      {hold?.status === 'ACTIVE' && (
        <HoldBar hold={hold} onExtend={() => extendHold(hold.id)} />
      )}

      <div className="page-head" style={{ marginTop: '1.2rem' }}>
        <div>
          <h1>{t('payway')}</h1>
          <p>
            {event
              ? `${locale === 'km' ? (event.titleKm ?? event.title_km) : (event.titleEn ?? event.title_en)} · `
              : ''}
            {t('bookingRef')} <span className="mono font-bold">{booking.booking_ref}</span>
          </p>
        </div>
        <Badge status={booking.state} />
      </div>

      <div className="pay-grid">
        {/* ------------------------------------------------ PayWay checkout */}
        <div className="stack-sm">
          {hosted && isOpen ? (
            checkout
          ) : (
            <div className="panel pw-launch">
              <div className="panel-body stack-sm text-center" style={{ alignItems: 'center' }}>
                <span className="icon-chip lg">
                  <Icon name={option.icon} size={22} />
                </span>
                <strong>{optionTitle(option.id, locale)}</strong>
                <p className="small muted">
                  {isOpen ? t('paywayHandoff') : t('checkoutClosed')}
                </p>
                {isOpen ? (
                  <button className="btn pw-pay btn-block" onClick={() => setSheetOpen(true)}>
                    <Icon name="lock" size={15} />
                    {t('openCheckout')}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block" onClick={() => openTransaction(option.id)}>
                    <Icon name="refresh" size={15} />
                    {t('tryAgain')}
                  </button>
                )}
                {isOpen && txn && (
                  <span className="small muted with-icon">
                    <Icon name="clock" size={13} />
                    {t('completeWithin')} {countdown(Date.parse(txn.expires_at) - now)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------- merchant status */}
        <div className="stack">
          <div className={`status-strip ${checking ? 'wait' : strip.tone}`}>
            {checking || isOpen ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <Icon
                name={
                  status === 'APPROVED' ? 'checkCircle' : status === 'DECLINED' ? 'xCircle' : 'info'
                }
                size={18}
              />
            )}
            <span className="flex-auto min-w-0">
              {checking ? t('checkingTransaction') : t(strip.key)}
            </span>
            {(checking || isOpen) && (
              <span className="small">
                {locale === 'km' ? 'ពិនិត្យ' : 'checked'} {polls}×
              </span>
            )}
          </div>

          {status === 'APPROVED' && !checking && (
            <Alert tone="success" title={t('paymentReceived')}>
              <span className="small">
                {txn?.apv && (
                  <>
                    {t('approvalCode')} <b className="mono">{txn.apv}</b> ·{' '}
                  </>
                )}
                {locale === 'km' ? 'កំពុងបើកសំបុត្ររបស់អ្នក…' : 'Opening your tickets…'}
              </span>
            </Alert>
          )}

          {['DECLINED', 'CANCELLED', 'EXPIRED'].includes(status) && !checking && (
            <Alert tone={status === 'DECLINED' ? 'danger' : 'warn'} title={t(strip.key)}>
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <button className="btn btn-sm btn-primary" onClick={() => openTransaction(option.id)}>
                  <Icon name="refresh" size={14} />
                  {t('tryAgain')}
                </button>
              </div>
            </Alert>
          )}

          {/* The purchase request as PayWay received it. */}
          <div className="panel">
            <div className="panel-head">
              <h3>{t('transaction')}</h3>
              <Link className="small with-icon" to={`/bookings/${booking.id}`}>
                {t('bookingRef')}
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
            <div className="panel-body">
              <dl className="kv">
                <dt>tran_id</dt>
                <dd className="mono">{txn?.tran_id || '—'}</dd>
                <dt>merchant_id</dt>
                <dd className="mono">{MERCHANT_ID}</dd>
                <dt>payment_option</dt>
                <dd className="mono">{txn?.payment_option || '—'}</dd>
                <dt>view_type</dt>
                <dd className="mono">{txn?.view_type || '—'}</dd>
                <dt>amount / currency</dt>
                <dd>{txn ? `${usd(txn.amount_usd_cents)} · USD` : '—'}</dd>
                <dt>req_time</dt>
                <dd className="mono">{txn?.req_time || '—'}</dd>
                <dt>hash</dt>
                <dd className="mono small truncate">{txn?.hash || '—'}</dd>
                <dt>status / apv</dt>
                <dd>
                  <span className="mono">{txn ? `${txn.status_code} · ${txn.status}` : '—'}</span>
                  {txn?.apv && <span className="mono"> · {txn.apv}</span>}
                </dd>
                {isOpen && txn && (
                  <>
                    <dt>lifetime</dt>
                    <dd>
                      {txn.lifetime} min · {countdown(Date.parse(txn.expires_at) - now)}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* What the return_url callback would carry back. */}
          <div className="panel">
            <div className="panel-head">
              <h3>{t('callback')}</h3>
              <span className="tiny mono">POST return_url</span>
            </div>
            <ResponsiveTable>
              <table className="table">
                <thead>
                  <tr>
                    <th>tran_id</th>
                    <th>{t('paymentMethod')}</th>
                    <th>{t('status')}</th>
                    <th>apv</th>
                    <th>{locale === 'km' ? 'ពេលវេលា' : 'Created'}</th>
                  </tr>
                </thead>
                <tbody>
                  {txn ? (
                    <tr>
                      <td className="mono small">{txn.tran_id}</td>
                      <td>{optionTitle(txn.payment_option, locale)}</td>
                      <td>
                        <Badge status={txn.status === 'APPROVED' ? 'SUCCESS' : txn.status === 'DECLINED' ? 'FAILED' : txn.status} />
                      </td>
                      <td className="mono small">{txn.apv || '—'}</td>
                      <td className="small muted">{dateTime(txn.created_at)}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={5} className="small muted">
                        {t('noCallbackYet')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>

          <div className="demo-note">
            <b className="with-icon">
              <Icon name="settings" size={14} />
              {t('simulate')}
            </b>{' '}
            — no PayWay merchant profile is attached to this prototype. The checkout above stands in
            for the HTML the Create Transaction call returns, and its buttons drive the outcomes the
            gateway would send to the return_url.
          </div>
        </div>
      </div>

      {!hosted && sheetOpen && checkout}
    </div>
  )
}
