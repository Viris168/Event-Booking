import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import HoldBar from '../components/HoldBar.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field, Money, Steps } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { FX_RATE_KHR_PER_USD, isValidPhone, khr, khrFromUsdCents, seatLabel, usd } from '../lib/format.js'
import { getHold } from '../api/holds.js'
import { getEvent } from '../api/events.js'
import { createBooking } from '../api/bookings.js'
import { mapHoldResponse, mapEvent } from '../api/adapters.js'

export default function CheckoutPage() {
  const { t, locale, dateTime } = useLocale()
  useDocumentTitle(t('checkout'))
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const holdId = params.get('hold')
  const eventIdParam = params.get('event')

  const [apiHoldData, setApiHoldData] = useState(null)
  const [apiEvent, setApiEvent] = useState(null)

  useEffect(() => {
    let active = true
    if (!holdId || !user?.id) return
    
    let foundEventId = eventIdParam
    
    if (!foundEventId) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key.startsWith('activeHoldId_') && sessionStorage.getItem(key) === holdId) {
          foundEventId = key.split('_')[1]
          break
        }
      }
    }

    if (foundEventId) {
      getHold(foundEventId, holdId, user.id)
        .then((res) => {
          if (active && res) setApiHoldData(mapHoldResponse(res))
        })
        .catch((e) => console.error(e))

      getEvent(foundEventId)
        .then((res) => {
          if (active && res) setApiEvent(mapEvent(res))
        })
        .catch((e) => console.error(e))
    }
    return () => { active = false }
  }, [holdId, eventIdParam, user?.id])

  const hold = apiHoldData?.hold
  const { seats = [], zoneLines = [], subtotalUsdCents = 0 } = apiHoldData || {}

  const [name, setName] = useState(user?.display_name || '')
  const [phone, setPhone] = useState(user?.phone_e164 || '')
  const [email, setEmail] = useState(user.email || '')
  const [provider, setProvider] = useState('BAKONG_KHQR')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Checkout is only reachable with a live hold.
  if (!hold) {
    return (
      <div className="container container-narrow">
        <Alert tone="warn" title={locale === 'km' ? 'គ្មានការកក់សកម្ម' : 'No active hold'}>
          <p>{t('holdExpired')}</p>
          <Link className="btn btn-sm btn-primary" to="/events" style={{ marginTop: '0.7rem' }}>
            {t('browseEvents')}
          </Link>
        </Alert>
      </div>
    )
  }

  const event = apiEvent
  const venue = event?.venue

  function validate() {
    const next = {}
    if (!name.trim()) next.name = locale === 'km' ? 'ត្រូវការឈ្មោះ' : 'Name is required'
    if (!isValidPhone(phone))
      next.phone = locale === 'km' ? 'ទម្រង់៖ +855 និងលេខ ៨–៩ តួ' : 'Format: +855 followed by 8–9 digits'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = locale === 'km' ? 'អ៊ីមែលមិនត្រឹមត្រូវ' : 'Enter a valid email'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submit(e) {
    e.preventDefault()
    if (submitting) return
    if (!validate()) {
      // Move focus to the first problem so the error is announced and reachable.
      requestAnimationFrame(() => {
        e.target.querySelector('[aria-invalid="true"]')?.focus()
      })
      return
    }
    setSubmitting(true)

    // Using snake_case for the API request based on Jackson configuration
    createBooking({
      hold_id: hold.id,
      holdId: hold.id,
      buyer_name: name.trim(),
      buyerName: name.trim(),
      buyer_phone_e164: phone.trim(),
      buyerPhoneE164: phone.trim(),
      buyer_email: email.trim() || null,
      buyerEmail: email.trim() || null,
    })
      .then((res) => {
        sessionStorage.removeItem(`activeHoldId_${event.id}`) // Clear hold now that it's booked
        navigate(`/checkout/${res.id}/pay`) // API returns booking ID as `id`
      })
      .catch((err) => {
        setSubmitting(false)
        const error = err.response?.data?.message || err.message
        toast(`Checkout failed: ${error}`, 'error')
      })
  }

  if (!event || !venue) return <div className="p-12 text-center text-muted">Loading checkout...</div>

  return (
    <div className="container">
      <Steps current={1} labels={[t('pickSeats'), t('checkout'), t('paymentMethod'), t('yourTickets')]} />

      <HoldBar hold={hold} onExtend={() => {}} onRelease={() => navigate(`/events/${event?.id}`)} />

      <div className="split" style={{ marginTop: '1.3rem' }}>
        <form className="stack" onSubmit={submit} noValidate>
          <div className="panel">
            <div className="panel-head">
              <h2>{t('buyerDetails')}</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label={t('fullName')} error={errors.name} className="span-2">
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={!!errors.name}
                    autoComplete="name"
                  />
                </Field>
                <Field
                  label={t('phone')}
                  error={errors.phone}
                  hint="+85512345678"
                >
                  <input
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-invalid={!!errors.phone}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </Field>
                <Field label={t('email')} optional error={errors.email}>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!errors.email}
                    autoComplete="email"
                  />
                </Field>
              </div>
              <p className="hint" style={{ marginTop: '0.7rem' }}>
                {locale === 'km'
                  ? 'យើងផ្ញើសំបុត្រ និងព័ត៌មានទៅលេខទូរស័ព្ទនេះ។'
                  : 'Tickets and updates go to this phone number.'}
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{t('paymentMethod')}</h2>
            </div>
            <div className="panel-body">
              <div className="radio-cards">
                <label className={`radio-card ${provider === 'BAKONG_KHQR' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="provider"
                    value="BAKONG_KHQR"
                    checked={provider === 'BAKONG_KHQR'}
                    onChange={() => setProvider('BAKONG_KHQR')}
                  />
                  <span className="rc-logo" aria-hidden="true">
                    <Icon name="qr" size={19} />
                  </span>
                  <span className="flex-auto min-w-0">
                    <span className="rc-title">{t('khqr')}</span>
                    <span className="rc-sub">{t('khqrHint')}</span>
                  </span>
                  <span className="badge badge-cool">KHR</span>
                </label>

                <label className={`radio-card ${provider === 'ABA_PAYWAY' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="provider"
                    value="ABA_PAYWAY"
                    checked={provider === 'ABA_PAYWAY'}
                    onChange={() => setProvider('ABA_PAYWAY')}
                  />
                  <span className="rc-logo" aria-hidden="true">
                    <Icon name="bank" size={19} />
                  </span>
                  <span className="flex-auto min-w-0">
                    <span className="rc-title">{t('payway')}</span>
                    <span className="rc-sub">{t('paywayHint')}</span>
                  </span>
                  <span className="badge badge-cool">USD</span>
                </label>
              </div>
            </div>
          </div>

          <button className="btn btn-accent btn-lg btn-block" type="submit" disabled={submitting}>
            {submitting ? `${t('loading')}` : `${t('placeOrder')} · ${usd(subtotalUsdCents)}`}
          </button>
        </form>

        {/* ----------------------------------------------------- order summary */}
        <div className="summary">
          <div className="panel">
            <div className="panel-head">
              <h3>{t('orderSummary')}</h3>
            </div>
            <div className="panel-body">
              <div className="stack-sm" style={{ marginBottom: '0.5rem' }}>
                <strong>{locale === 'km' ? event.title_km : event.title_en}</strong>
                <span className="meta-row">
                  <Icon name="calendar" size={14} />
                  <span>{dateTime(event.starts_at)}</span>
                </span>
                <span className="meta-row">
                  <Icon name="mapPin" size={14} />
                  <span>{locale === 'km' ? venue.nameKm : venue.nameEn}</span>
                </span>
              </div>

              {seats.map((s) => (
                <div className="line" key={s.id}>
                  <span>
                    <span className="line-title">{seatLabel(s)}</span>
                    <div className="line-sub">
                      {locale === 'km' ? s.seat_class?.name_km : s.seat_class?.name_en}
                    </div>
                  </span>
                  <span>{usd(s.seat_class?.price_usd_cents)}</span>
                </div>
              ))}
              {zoneLines.map((l) => (
                <div className="line" key={l.id}>
                  <span>
                    <span className="line-title">{locale === 'km' ? l.zone.name_km : l.zone.name_en}</span>
                    <div className="line-sub">
                      {l.qty} × {usd(l.zone.price_usd_cents)} · {t('qty')} {l.qty}
                    </div>
                  </span>
                  <span>{usd(l.qty * l.zone.price_usd_cents)}</span>
                </div>
              ))}

              <div className="totals">
                <div className="total-row">
                  <span>{t('subtotal')}</span>
                  <span>{usd(subtotalUsdCents)}</span>
                </div>
                <div className="total-row big">
                  <span>{t('total')}</span>
                  <b>{usd(subtotalUsdCents)}</b>
                </div>
                <div className="total-row">
                  <span className="small muted">KHR</span>
                  <span className="total-khr">{khr(khrFromUsdCents(subtotalUsdCents))}</span>
                </div>
                <p className="hint">
                  {t('fxNote')}: 1 USD = {FX_RATE_KHR_PER_USD.toLocaleString('en-US')} KHR
                </p>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <Alert tone="warn" title={t('notYoursYet')}>
              <span className="small">
                {locale === 'km'
                  ? 'កៅអីនឹងលែងវិញដោយស្វ័យប្រវត្តិ ប្រសិនបើពេលកក់ផុតកំណត់មុនពេលបង់ប្រាក់។'
                  : 'If the hold runs out before payment clears, the seats go back on sale automatically.'}
              </span>
            </Alert>
          </div>

        </div>
      </div>
    </div>
  )
}
