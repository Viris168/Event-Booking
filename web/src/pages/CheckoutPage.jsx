import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import HoldBar from '../components/HoldBar.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field, Money, Steps } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { isValidPhone, seatLabel, usd } from '../lib/format.js'
import { getHold } from '../api/holds.js'
import { getEvent } from '../api/events.js'
import { createBooking } from '../api/bookings.js'
import { mapHoldResponse, mapEvent } from '../api/adapters.js'
import { DEFAULT_OPTION, PAYMENT_OPTIONS, optionSub, optionTitle } from '../lib/payway.js'

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

  // PayWay's purchase call takes firstname/lastname/email/phone separately, so
  // the form collects them that way rather than as one display name.
  const [firstName, setFirstName] = useState(() => (user?.display_name || '').split(' ')[0] || '')
  const [lastName, setLastName] = useState(
    () => (user?.display_name || '').split(' ').slice(1).join(' '),
  )
  const [phone, setPhone] = useState(user?.phone_e164 || '')
  const [email, setEmail] = useState(user.email || '')
  const [option, setOption] = useState(DEFAULT_OPTION)
  const [viewType, setViewType] = useState('popup')
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
    if (!firstName.trim())
      next.firstName = locale === 'km' ? 'ត្រូវការនាមខ្លួន' : 'First name is required'
    if (!lastName.trim())
      next.lastName = locale === 'km' ? 'ត្រូវការនាមត្រកូល' : 'Last name is required'
    if (!isValidPhone(phone))
      next.phone = locale === 'km' ? 'ទម្រង់៖ +855 និងលេខ ៨–៩ តួ' : 'Format: +855 followed by 8–9 digits'
    // PayWay requires an email on purchase — it is where the receipt goes.
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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
    const buyerName = `${firstName.trim()} ${lastName.trim()}`.trim()

    // Using snake_case for the API request based on Jackson configuration
    createBooking({
      hold_id: hold.id,
      holdId: hold.id,
      buyer_name: buyerName,
      buyerName,
      buyer_phone_e164: phone.trim(),
      buyerPhoneE164: phone.trim(),
      buyer_email: email.trim() || null,
      buyerEmail: email.trim() || null,
    })
      .then((res) => {
        sessionStorage.removeItem(`activeHoldId_${event.id}`) // Clear hold now that it's booked
        // The pay page stands in for the merchant page that calls Create
        // Transaction and then opens PayWay's checkout in the chosen view.
        navigate(`/checkout/${res.id}/pay?option=${option}&view=${viewType}`)
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
      <Steps current={1} labels={[t('pickSeats'), t('checkoutPay'), t('yourTickets')]} />

      <HoldBar hold={hold} onExtend={() => {}} onRelease={() => navigate(`/events/${event?.id}`)} />

      <div className="split" style={{ marginTop: '1.3rem' }}>
        <form className="stack" onSubmit={submit} noValidate>
          <div className="panel">
            <div className="panel-head">
              <h2>{t('buyerDetails')}</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label={t('firstName')} error={errors.firstName}>
                  <input
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    aria-invalid={!!errors.firstName}
                    autoComplete="given-name"
                    maxLength={100}
                  />
                </Field>
                <Field label={t('lastName')} error={errors.lastName}>
                  <input
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    aria-invalid={!!errors.lastName}
                    autoComplete="family-name"
                    maxLength={100}
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
                    maxLength={20}
                  />
                </Field>
                <Field label={t('email')} error={errors.email}>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!errors.email}
                    autoComplete="email"
                    maxLength={50}
                  />
                </Field>
              </div>
              <p className="hint" style={{ marginTop: '0.7rem' }}>
                {locale === 'km'
                  ? 'យើងផ្ញើសំបុត្រទៅលេខទូរស័ព្ទនេះ ហើយបង្កាន់ដៃ ABA PayWay ទៅអ៊ីមែលនេះ។'
                  : 'Tickets go to this phone number; the ABA PayWay receipt goes to this email.'}
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{t('paymentMethod')}</h2>
              <span className="pw-badge">
                <Icon name="lock" size={13} />
                ABA PayWay
              </span>
            </div>
            <div className="panel-body">
              <div className="radio-cards">
                {PAYMENT_OPTIONS.map((o) => (
                  <label
                    key={o.id}
                    className={`radio-card ${option === o.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="payment_option"
                      value={o.id}
                      checked={option === o.id}
                      onChange={() => setOption(o.id)}
                    />
                    <span className="rc-logo" aria-hidden="true">
                      <Icon name={o.icon} size={19} />
                    </span>
                    <span className="flex-auto min-w-0">
                      <span className="rc-title">{optionTitle(o.id, locale)}</span>
                      <span className="rc-sub">{optionSub(o.id, locale)}</span>
                    </span>
                    <span className="badge badge-cool">{o.currency}</span>
                  </label>
                ))}
              </div>

              {/* PayWay's view_type: a popup/bottom sheet over this page, or its
                  hosted page opened in place. */}
              <div className="pw-view-toggle">
                <span className="tiny">{t('checkoutView')}</span>
                <div className="seg">
                  <button
                    type="button"
                    className={viewType === 'popup' ? 'active' : ''}
                    onClick={() => setViewType('popup')}
                  >
                    {t('viewPopup')}
                  </button>
                  <button
                    type="button"
                    className={viewType === 'hosted_view' ? 'active' : ''}
                    onClick={() => setViewType('hosted_view')}
                  >
                    {t('viewHosted')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button className="btn btn-accent btn-lg btn-block" type="submit" disabled={submitting}>
            {submitting ? `${t('loading')}` : `${t('pay')} · ${usd(subtotalUsdCents)}`}
          </button>
          <p className="hint text-center with-icon" style={{ justifyContent: 'center' }}>
            <Icon name="lock" size={13} />
            {t('paywayHandoff')}
          </p>
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
                <p className="hint">{t('chargedInUsd')}</p>
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
