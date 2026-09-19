import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { usd, countdown } from '../lib/format.js'

export default function ReserveModal({ hold, seats = [], zoneLines = [], subtotalUsdCents = 0, onRelease, onRemoveItem, checkoutTo }) {
  const { t, locale } = useLocale()
  const [now, setNow] = useState(() => Date.now())
  const [dismissedHoldId, setDismissedHoldId] = useState(null)

  useEffect(() => {
    if (!hold?.expires_at) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [hold?.expires_at])

  if (!hold || dismissedHoldId === hold.id) return null

  const msLeft = hold ? new Date(hold.expires_at).getTime() - now : 0
  if (msLeft <= 0) return null

  const warn = msLeft < 2 * 60 * 1000

  let totalQty = seats.length
  for (const z of zoneLines) {
    totalQty += z.qty
  }
  const ticketLabel =
    locale === 'km'
      ? `${totalQty} សំបុត្រ`
      : `${totalQty} ticket${totalQty === 1 ? '' : 's'}`

  return (
    <div className="modal-overlay">
      <div className="modal-container reserve-modal">
        <div className="reserve-head">
          <div className="reserve-head-icon">
            <Icon name="ticket" size={20} />
          </div>
          <div>
            <div className="reserve-kicker">{t('holdActive')}</div>
            <h3>{locale === 'km' ? 'សង្ខេបការកក់' : 'Order summary'}</h3>
          </div>
          <span className="reserve-count">{ticketLabel}</span>
          <button
            className="reserve-quit"
            type="button"
            onClick={() => setDismissedHoldId(hold.id)}
            title={locale === 'km' ? 'បិទ តែរក្សាការកក់ទុក' : 'Quit but keep hold'}
          >
            <Icon name="close" size={19} />
          </button>
        </div>

        <div className="modal-body">
          <div className="reserve-items">
            {seats.map((s) => (
              <div className="reserve-line" key={s.id || s.event_seat_id || s.seat_number}>
                <div className="reserve-line-mark">
                  <Icon name="seat" size={16} />
                </div>
                <div className="line-info">
                  <div className="line-title">
                    {s.section_label || 'Normal'} &middot; {s.seat_number}
                  </div>
                  <div className="line-sub">
                    {locale === 'km' ? s.seat_class?.name_km : s.seat_class?.name_en}
                  </div>
                </div>
                <div className="line-actions">
                  <span className="line-price">{usd(s.price_usd_cents ?? s.seat_class?.price_usd_cents)}</span>
                  {onRemoveItem && (
                    <button className="btn-remove" onClick={() => onRemoveItem('seat', s.id || s.event_seat_id)} title={locale === 'km' ? 'ដកកៅអីចេញ' : 'Remove seat'}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {zoneLines.map((l) => (
              <div className="reserve-line" key={l.event_zone_id || l.zone?.id}>
                <div className="reserve-line-mark">
                  <Icon name="ticket" size={16} />
                </div>
                <div className="line-info">
                  <div className="line-title">{(locale === 'km' ? l.zone?.name_km : l.zone?.name_en) || l.zone?.name_en || l.zone?.name_km || 'Zone'}</div>
                  <div className="line-sub">
                    {l.qty} × {usd(l.zone?.price_usd_cents)}
                  </div>
                </div>
                <div className="line-actions">
                  <span className="line-price">{usd(l.lineTotalCents ?? l.qty * (l.zone?.price_usd_cents || 0))}</span>
                  {onRemoveItem && (
                    <button className="btn-remove" onClick={() => onRemoveItem('zone', l.event_zone_id || l.zone?.id)} title={locale === 'km' ? 'ដកតំបន់ចេញ' : 'Remove zone'}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="reserve-total">
            <span>{t('total')}</span>
            <span className="total-val">{usd(subtotalUsdCents)}</span>
          </div>
        </div>

        <div className="modal-footer">
          <div className={`reserve-timer ${warn ? 'warn' : ''}`}>
            <Icon name="clock" size={16} />
            <span>{t('holdExpiresIn')} {countdown(msLeft)}</span>
          </div>

          <div className="reserve-actions">
            {onRelease && (
              <button className="btn-release" onClick={onRelease}>
                {t('releaseHold')}
              </button>
            )}
            {checkoutTo && (
              <Link className="btn-checkout" to={checkoutTo}>
                {t('goToCheckout')}
                <Icon name="arrowRight" size={16} />
              </Link>
            )}
          </div>
          <p className="reserve-note">{t('notYoursYet')}</p>
        </div>
      </div>
    </div>
  )
}
