import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import QrGlyph from './QrGlyph.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown, usd } from '../lib/format.js'
import { MERCHANT_NAME, optionSub, paymentOption } from '../lib/payway.js'

/**
 * The checkout PayWay returns from Create Transaction, rendered locally.
 *
 * `mode="popup"` is the desktop modal / mobile bottom sheet the PayWay plugin
 * opens with AbaPayway.checkout(); `mode="hosted"` is the full-page view_type=
 * hosted_view variant, drawn inline instead of over a scrim. Both show the same
 * sheet, because that is what PayWay serves to both.
 *
 * The buyer never leaves this component: it ends by handing a settled status
 * back through onSettled, which is the point the merchant page picks up the
 * return_url half of the flow.
 */
export default function PaywayCheckout({
  txn,
  mode = 'popup',
  merchant = MERCHANT_NAME,
  items = [],
  onSettled,
  onClose,
}) {
  const { t, locale } = useLocale()
  const [step, setStep] = useState('method') // method | processing
  const [processing, setProcessing] = useState(null) // status being confirmed
  const sheetRef = useRef(null)
  const [now, setNow] = useState(() => Date.now())

  const option = paymentOption(txn?.payment_option)
  const left = txn ? Date.parse(txn.expires_at) - now : 0
  const expired = left <= 0

  // The lifetime countdown PayWay prints under its checkout.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Esc closes the popup the way the plugin's own overlay does.
  useEffect(() => {
    if (mode !== 'popup') return
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    sheetRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  useEffect(() => {
    setStep('method')
  }, [txn?.tran_id])

  if (!txn) return null

  /** Completing payment inside the sheet, then PayWay confirming it. */
  function complete(status) {
    setProcessing(status)
    setStep('processing')
    setTimeout(() => {
      setProcessing(null)
      onSettled?.(status)
    }, 1400)
  }

  const amountLine = usd(txn.amount_usd_cents)

  const sheet = (
    <div
      className={`pw-sheet ${mode === 'hosted' ? 'pw-hosted' : ''}`}
      role="dialog"
      aria-modal={mode === 'popup'}
      aria-label="ABA PayWay checkout"
      tabIndex={-1}
      ref={sheetRef}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pw-head">
        <span className="pw-mark">
          ABA <span>PayWay</span>
        </span>
        {mode === 'popup' && (
          <button className="pw-close" onClick={onClose} aria-label={t("close")}>
            <Icon name="close" size={17} />
          </button>
        )}
      </div>

      <div className="pw-amount">
        <span className="pw-merchant">{merchant}</span>
        <b>{amountLine}</b>
        <span className="pw-tran mono">#{txn.tran_id}</span>
      </div>

      <div className="pw-body">
        {step === 'processing' ? (
          <Processing status={processing} locale={locale} t={t} />
        ) : (
          <>
            <QrPanel
              option={option}
              txn={txn}
              onPay={complete}
              disabled={expired}
              t={t}
              locale={locale}
            />

            {items.length > 0 && (
              <details className="pw-items">
                <summary>{t('orderSummary')}</summary>
                <ul>
                  {items.map((it, i) => (
                    <li key={i}>
                      <span className="min-w-0 flex-auto truncate">{it.name}</span>
                      <span className="muted small">× {it.quantity}</span>
                      <span>{usd(it.priceUsdCents * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>

      <div className="pw-foot">
        <span className="with-icon">
          <Icon name="lock" size={13} />
          {t('securedByAba')}
        </span>
        {txn.status === 'PENDING' && (
          <span className={`pw-timer ${left < 60000 ? 'urgent' : ''}`}>
            <Icon name="clock" size={13} />
            {expired ? t('expired') : countdown(left)}
          </span>
        )}
      </div>
    </div>
  )

  if (mode === 'hosted') return sheet
  return (
    <div className="pw-scrim" onClick={onClose}>
      {sheet}
    </div>
  )
}

/* ------------------------------------------------------------------ steps */

function Processing({ status, locale, t }) {
  return (
    <div className="pw-processing">
      <span className="spinner" aria-hidden="true" />
      <b>{status === 'APPROVED' ? t('completingPayment') : t('contactingBank')}</b>
      <span className="small muted text-center">
        {locale === 'km'
          ? 'សូមកុំបិទផ្ទាំងនេះ។'
          : 'Do not close this window.'}
      </span>
    </div>
  )
}

/* ----------------------------------------------------------------- panels */

function QrPanel({ option, txn, onPay, disabled, t, locale }) {
  const deeplink = option.kind === 'deeplink'
  const [handedOff, setHandedOff] = useState(false)

  return (
    <div className="stack-sm">
      <div className={`pw-qr ${disabled ? 'is-dead' : ''}`}>
        <div className="pw-qr-top">
          <span className="with-icon">
            <Icon name="qr" size={15} strokeWidth={2} />
            KHQR
          </span>
          <span className="tiny">ABA PAY</span>
        </div>
        <div className="pw-qr-body">
          <QrGlyph token={txn.tran_id} label={`KHQR ${t('scanToPay')}`} />
        </div>
        <p className="pw-qr-note small muted">{optionSub(option.id, locale)}</p>
      </div>

      {deeplink && (
        <button
          className="btn btn-primary btn-block"
          disabled={disabled}
          onClick={() => setHandedOff(true)}
        >
          {t('openAbaMobile')}
          <Icon name="external" size={15} />
        </button>
      )}

      <p className="pw-wait small muted with-icon">
        <span className="spinner" aria-hidden="true" />
        {handedOff ? t('returnAfterPaying') : t('waitingForPayment')}
      </p>

      <DemoRow onPay={onPay} disabled={disabled} t={t} paidLabel={t('simulateScanPaid')} />
    </div>
  )
}

/**
 * There is no gateway behind this prototype, so the outcomes a real PayWay
 * session would produce are driven from here.
 */
function DemoRow({ onPay, disabled, t, paidLabel, hidePaid = false }) {
  return (
    <div className="pw-demo">
      <span className="tiny">{t('simulate')}</span>
      <div className="row">
        {!hidePaid && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={disabled}
            onClick={() => onPay('APPROVED')}
          >
            <Icon name="check" size={13} />
            {paidLabel || t('simulateSuccess')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={disabled}
          onClick={() => onPay('DECLINED')}
        >
          <Icon name="close" size={13} />
          {t('simulateFail')}
        </button>
      </div>
    </div>
  )
}
