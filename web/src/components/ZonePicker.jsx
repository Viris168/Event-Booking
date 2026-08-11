import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { zoneRemaining } from '../mock/store.js'
import { Money } from './ui.jsx'

const MAX_PER_ORDER = 10

/**
 * General-admission picker. Remaining capacity is deliberately vague once it
 * gets low ("Almost full") so the page doesn't invite refresh-spam — but the
 * stepper is still hard-capped at what actually remains.
 */
export default function ZonePicker({ zones, qty, onChange, disabled = false }) {
  const { t, locale } = useLocale()

  function remainingCopy(remaining) {
    if (remaining === 0) return { text: t('soldOut'), tone: 'badge-hot', icon: 'xCircle' }
    if (remaining <= 20) return { text: t('almostFull'), tone: 'badge-hot', icon: 'trending' }
    if (remaining <= 60) return { text: t('fillingFast'), tone: 'badge-warm', icon: 'trending' }
    return { text: `${remaining} ${t('spotsLeft')}`, tone: 'badge-cool', icon: 'users' }
  }

  return (
    <div className="stack-sm">
      {zones.map((zone) => {
        const remaining = zoneRemaining(zone)
        const picked = qty[zone.id] || 0
        const cap = Math.min(MAX_PER_ORDER, remaining)
        const info = remainingCopy(remaining)
        return (
          <div
            key={zone.id}
            className={`zone-card ${picked ? 'picked' : ''} ${remaining === 0 ? 'full' : ''}`}
          >
            <div>
              <div className="row row-tight">
                <span className="zone-name">{locale === 'km' ? zone.name_km : zone.name_en}</span>
                <span className={`badge ${info.tone}`}>
                  <Icon name={info.icon} size={12} />
                  {info.text}
                </span>
              </div>
              <div className={locale === 'km' ? 'zone-name-km' : 'zone-name-km km'}>
                {locale === 'km' ? zone.name_en : zone.name_km}
              </div>
              <div className="zone-cap">
                <Money cents={zone.price_usd_cents} /> {t('each')}
              </div>
            </div>

            <div className="stepper" role="group" aria-label={zone.name_en}>
              <button
                type="button"
                onClick={() => onChange(zone.id, Math.max(0, picked - 1))}
                disabled={disabled || picked === 0}
                aria-label="Decrease"
              >
                <Icon name="minus" size={16} strokeWidth={2.25} />
              </button>
              <span className="qty" aria-live="polite">
                {picked}
              </span>
              <button
                type="button"
                onClick={() => onChange(zone.id, Math.min(cap, picked + 1))}
                disabled={disabled || picked >= cap}
                aria-label="Increase"
              >
                <Icon name="plus" size={16} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        )
      })}
      <p className="hint">Maximum {MAX_PER_ORDER} tickets per zone, per order.</p>
    </div>
  )
}
