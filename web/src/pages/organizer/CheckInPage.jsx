import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Field } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { checkInTicket, recentCheckIns, ticketsOf, listBookings, useStore } from '../../mock/store.js'

/**
 * Door check-in. Camera capture is stubbed — the manual code field drives the
 * same three outcomes the real scanner has to render instantly.
 */
export default function CheckInPage() {
  useStore()
  const { t, locale, dateTime } = useLocale()
  const { user, organizerProfile } = useAuth()
  const [code, setCode] = useState('')
  const [last, setLast] = useState(null)

  const recent = recentCheckIns(organizerProfile?.id || null, 8)

  function scan(token) {
    const value = (token || '').trim()
    if (!value) return
    const outcome = checkInTicket(value, user.id)
    setLast(outcome)
    setCode('')
  }

  // Demo helper: pick a real token so the scanner can be exercised.
  function sampleToken() {
    const confirmed = listBookings({}).find((b) => b.state === 'CONFIRMED')
    if (!confirmed) return null
    return ticketsOf(confirmed.id)[0]?.qr_token || null
  }

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('checkIn')}</h1>
          <p>
            {locale === 'km'
              ? 'ស្កេន QR នៅមាត់ទ្វារ។ សំបុត្រមួយអាចប្រើបានតែម្តង។'
              : 'Scan tickets at the door. Each ticket admits exactly once.'}
          </p>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h2>{t('scanTicket')}</h2>
            </div>
            <div className="panel-body stack-sm">
              <div className="scanner">
                <div className="scan-frame">
                  <div className="scan-line" />
                  <Icon name="qr" size={40} className="scan-hint" strokeWidth={1.2} />
                </div>
                <span className="small" style={{ position: 'absolute', bottom: 12 }}>
                  {locale === 'km' ? 'កាមេរ៉ាមិនមានក្នុងគំរូនេះ' : 'Camera capture is stubbed in this prototype'}
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  scan(code)
                }}
              >
                <Field label={t('manualEntry')} hint="eb-4820-kh-1-1">
                  <div className="row">
                    <input
                      className="input grow"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Ticket code"
                    />
                    <button className="btn btn-primary" type="submit" disabled={!code.trim()}>
                      <Icon name="scan" size={15} />
                      {locale === 'km' ? 'ពិនិត្យ' : 'Check'}
                    </button>
                  </div>
                </Field>
              </form>

              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  const token = sampleToken()
                  if (token) setCode(token)
                }}
              >
                {locale === 'km' ? 'បញ្ចូលកូដសាកល្បង' : 'Fill a real demo ticket code'}
              </button>
            </div>
          </div>

          {last && (
            <div
              className={`scan-result ${
                last.result === 'VALID' ? 'ok' : last.result === 'ALREADY_USED' ? 'warn' : 'bad'
              }`}
            >
              <span className="icon" aria-hidden="true">
                <Icon
                  name={
                    last.result === 'VALID'
                      ? 'checkCircle'
                      : last.result === 'ALREADY_USED'
                        ? 'alert'
                        : 'xCircle'
                  }
                  size={30}
                  strokeWidth={2}
                />
              </span>
              <div>
                <b>
                  {last.result === 'VALID'
                    ? t('validAdmit')
                    : last.result === 'ALREADY_USED'
                      ? t('alreadyUsed')
                      : last.result === 'NOT_VALID'
                        ? `${locale === 'km' ? 'សំបុត្រមិនមានប្រសិទ្ធភាព' : 'Ticket not valid'} · ${last.reason}`
                        : t('notFound')}
                </b>
                {last.detail && (
                  <span>
                    {last.detail.label} · {last.detail.booking?.booking_ref} ·{' '}
                    {locale === 'km' ? last.detail.event?.title_km : last.detail.event?.title_en}
                  </span>
                )}
                {last.result === 'ALREADY_USED' && (
                  <span>
                    {locale === 'km' ? 'ស្កេនដំបូង' : 'First scanned'} {dateTime(last.at)}
                  </span>
                )}
                {last.result === 'NOT_FOUND' && (
                  <span>{locale === 'km' ? 'រកមិនឃើញកូដនេះ' : 'No ticket matches that code.'}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{locale === 'km' ? 'ការស្កេនថ្មីៗ' : 'Recent scans'}</h3>
          </div>
          <div className="panel-body">
            {recent.length ? (
              <ul className="timeline">
                {recent.map((d) => (
                  <li key={d.ticket.id}>
                    <div>
                      <b>{d.label}</b>
                      <div className="small muted">
                        {locale === 'km' ? d.event?.title_km : d.event?.title_en} ·{' '}
                        {d.booking?.booking_ref}
                      </div>
                      <div className="small muted">{dateTime(d.ticket.checked_in_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                {locale === 'km' ? 'មិនទាន់មានការស្កេន' : 'Nothing scanned yet.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
