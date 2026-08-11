import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HoldBar from '../components/HoldBar.jsx'
import Icon from '../components/Icon.jsx'
import QrGlyph from '../components/QrGlyph.jsx'
import { Alert, Badge, Money, Steps } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown, khr, usd } from '../lib/format.js'
import {
  extendHold,
  getBooking,
  getEvent,
  getHold,
  latestPayment,
  paymentsForBooking,
  resolvePayment,
  startPayment,
  useStore,
} from '../mock/store.js'

// How each payment_transaction.status reads on screen.
const STRIP = {
  CREATED: { tone: 'wait', key: 'waitingForPayment' },
  PENDING: { tone: 'wait', key: 'waitingForPayment' },
  SUCCESS: { tone: 'ok', key: 'paymentReceived' },
  FAILED: { tone: 'bad', key: 'paymentFailedMsg' },
  CANCELLED: { tone: 'neutral', key: 'cancel' },
  EXPIRED: { tone: 'neutral', key: 'holdExpired' },
}

export default function PaymentPage() {
  const { bookingId } = useParams()
  useStore()
  const { t, locale, dateTime } = useLocale()
  const navigate = useNavigate()
  const [polls, setPolls] = useState(0)
  const [redirecting, setRedirecting] = useState(false)

  const booking = getBooking(bookingId)
  const payment = booking ? latestPayment(booking.id) : null
  const attempts = booking ? paymentsForBooking(booking.id) : []
  const event = booking ? getEvent(booking.event_id) : null
  const hold = booking ? getHold(booking.hold_id) : null

  // Stand-in for the status poll the real KHQR screen runs.
  useEffect(() => {
    if (!payment || !['CREATED', 'PENDING'].includes(payment.status)) return
    const timer = setInterval(() => setPolls((n) => n + 1), 2500)
    return () => clearInterval(timer)
  }, [payment?.id, payment?.status])

  // Once the money lands, move on to the tickets.
  useEffect(() => {
    if (payment?.status !== 'SUCCESS') return
    const timer = setTimeout(() => navigate(`/bookings/${booking.id}`), 1400)
    return () => clearTimeout(timer)
  }, [payment?.status, booking?.id, navigate])

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

  const strip = STRIP[payment?.status] || STRIP.PENDING
  const isOpen = ['CREATED', 'PENDING'].includes(payment?.status)
  const isKhqr = payment?.provider === 'BAKONG_KHQR'

  function retry(provider) {
    startPayment(booking.id, provider)
    setPolls(0)
    setRedirecting(false)
  }

  function fakeRedirect() {
    setRedirecting(true)
    // A real PayWay flow leaves the site and comes back to a return URL.
    setTimeout(() => setRedirecting(false), 1800)
  }

  return (
    <div className="container">
      <Steps current={2} labels={[t('pickSeats'), t('checkout'), t('paymentMethod'), t('yourTickets')]} />

      {hold?.status === 'ACTIVE' && (
        <HoldBar hold={hold} onExtend={() => extendHold(hold.id)} />
      )}

      <div className="page-head" style={{ marginTop: '1.2rem' }}>
        <div>
          <h1>{isKhqr ? t('scanToPay') : t('payway')}</h1>
          <p>
            {locale === 'km' ? event.title_km : event.title_en} · {t('bookingRef')}{' '}
            <span className="mono strong">{booking.booking_ref}</span>
          </p>
        </div>
        <Badge status={booking.state} />
      </div>

      <div className="pay-grid">
        {/* --------------------------------------------------- provider panel */}
        <div>
          {isKhqr ? (
            <div className={`qr-frame ${isOpen ? '' : 'qr-expired'}`}>
              <div className="qr-top">
                <span className="with-icon">
                  <Icon name="qr" size={16} strokeWidth={2} />
                  KHQR
                </span>
                <span className="small" style={{ opacity: 0.85 }}>
                  BAKONG
                </span>
              </div>
              <div className="qr-amount">
                <div className="tiny">KH-EVENT BOOKING</div>
                <b>{khr(booking.total_khr)}</b>
                <div className="small muted">{usd(booking.total_usd_cents)}</div>
              </div>
              <div className="qr-body">
                <QrGlyph token={payment?.provider_ref || booking.booking_ref} label="Bakong KHQR" />
                <span className="small muted center">
                  {locale === 'km'
                    ? 'ស្កេនដោយ Bakong, ABA, ACLEDA, Wing…'
                    : 'Scan with Bakong, ABA, ACLEDA, Wing…'}
                </span>
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-body stack-sm center" style={{ alignItems: 'center' }}>
                <span className="icon-chip lg">
                  <Icon name="bank" size={22} />
                </span>
                <strong>{t('payway')}</strong>
                <p className="small muted">{t('paywayHint')}</p>
                {isOpen && (
                  <button className="btn btn-primary btn-block" onClick={fakeRedirect} disabled={redirecting}>
                    {redirecting ? t('loading') : t('openPayway')}
                    {!redirecting && <Icon name="external" size={15} />}
                  </button>
                )}
                {redirecting && (
                  <p className="small muted">
                    {locale === 'km'
                      ? 'កំពុងបញ្ជូនទៅ ABA… បន្ទាប់មកនឹងត្រឡប់មកវិញ។'
                      : 'Redirecting to ABA… you will return here afterwards.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------- status column */}
        <div className="stack">
          <div className={`status-strip ${strip.tone}`}>
            {isOpen ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <Icon
                name={
                  payment?.status === 'SUCCESS'
                    ? 'checkCircle'
                    : payment?.status === 'FAILED'
                      ? 'xCircle'
                      : 'info'
                }
                size={18}
              />
            )}
            <span className="grow">
              {payment?.status === 'SUCCESS'
                ? t('paymentReceived')
                : payment?.status === 'FAILED'
                  ? t('paymentFailedMsg')
                  : payment?.status === 'CANCELLED'
                    ? locale === 'km'
                      ? 'ការទូទាត់ត្រូវបានបោះបង់'
                      : 'Payment attempt cancelled'
                    : payment?.status === 'EXPIRED'
                      ? locale === 'km'
                        ? 'QR ផុតកំណត់ សូមបង្កើតម្តងទៀត'
                        : 'This QR expired — start a new attempt'
                      : t('waitingForPayment')}
            </span>
            {isOpen && (
              <span className="small">
                {locale === 'km' ? 'ពិនិត្យ' : 'checked'} {polls}×
              </span>
            )}
          </div>

          {payment?.status === 'SUCCESS' && (
            <Alert tone="success" title={t('paymentReceived')}>
              {locale === 'km' ? 'កំពុងបើកសំបុត្ររបស់អ្នក…' : 'Opening your tickets…'}
            </Alert>
          )}

          {['FAILED', 'CANCELLED', 'EXPIRED'].includes(payment?.status) && (
            <div className="row">
              <button className="btn btn-primary" onClick={() => retry('BAKONG_KHQR')}>
                {t('tryAgain')} · {t('khqr')}
              </button>
              <button className="btn btn-outline" onClick={() => retry('ABA_PAYWAY')}>
                {t('tryAgain')} · {t('payway')}
              </button>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h3>{t('orderSummary')}</h3>
              <Link className="small with-icon" to={`/bookings/${booking.id}`}>
                {t('bookingRef')}
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
            <div className="panel-body">
              <dl className="kv">
                <dt>{t('total')}</dt>
                <dd>
                  <Money cents={booking.total_usd_cents} rate={booking.fx_rate_khr_per_usd} />
                </dd>
                <dt>{t('fxNote')}</dt>
                <dd>1 USD = {Number(booking.fx_rate_khr_per_usd).toLocaleString('en-US')} KHR</dd>
                <dt>{t('paymentMethod')}</dt>
                <dd>{isKhqr ? t('khqr') : t('payway')}</dd>
                <dt>Provider ref</dt>
                <dd className="mono">{payment?.provider_ref || '—'}</dd>
                {payment?.expires_at && (
                  <>
                    <dt>{locale === 'km' ? 'QR ផុតកំណត់ក្នុង' : 'QR expires in'}</dt>
                    <dd>
                      {countdown(new Date(payment.expires_at).getTime() - Date.now())}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>{t('paymentHistory')}</h3>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('paymentMethod')}</th>
                    <th>{t('status')}</th>
                    <th>Ref</th>
                    <th>{locale === 'km' ? 'ពេលវេលា' : 'Created'}</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.provider === 'BAKONG_KHQR' ? t('khqr') : t('payway')}</td>
                      <td>
                        <Badge status={p.status} />
                      </td>
                      <td className="mono small">{p.provider_ref || '—'}</td>
                      <td className="small muted">{dateTime(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isOpen && (
            <div className="demo-note">
              <b className="with-icon">
                <Icon name="settings" size={14} />
                {t('simulate')}
              </b>{' '}
              — this prototype has no payment provider attached. Use these to drive the states the
              real webhook would deliver.
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => resolvePayment(booking.id, 'SUCCESS')}
                >
                  <Icon name="check" size={14} />
                  {t('simulateSuccess')}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => resolvePayment(booking.id, 'FAILED')}>
                  <Icon name="close" size={14} />
                  {t('simulateFail')}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => resolvePayment(booking.id, 'CANCELLED')}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
