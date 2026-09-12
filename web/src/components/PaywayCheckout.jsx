import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'
import QrGlyph from './QrGlyph.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { usd } from '../lib/format.js'
import { MERCHANT_NAME } from '../lib/payway.js'
import KhqrCard from './KhqrCard.jsx'

/**
 * The checkout PayWay returns from Create Transaction, rendered locally.
 *
 * Always the view_type=popup sheet the PayWay plugin opens with
 * AbaPayway.checkout(): a modal on desktop, a bottom sheet on phones.
 *
 * Display only. Settlement is not decided here: the merchant page polls
 * check-transaction and flips txn.status itself, and this sheet follows that
 * status into SuccessScreen. Nothing in here can confirm a payment, which is
 * the correct shape — the buyer's browser is not a source of truth about money.
 */
export default function PaywayCheckout({
  txn,
  merchant = MERCHANT_NAME,
  onClose,
}) {
  const { t } = useLocale()
  const sheetRef = useRef(null)

  // Esc closes the popup the way the plugin's own overlay does.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    sheetRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!txn) return null

  const amountLine = usd(txn.amount_usd_cents)

  const sheetContent = txn.status === 'APPROVED' || txn.status === 'SUCCESS' ? (
    <SuccessScreen bookingId={txn.booking_id ?? txn.bookingId} />
  ) : (
    <>
      <div className="pw-head-new">
        <span className="pw-title-new">ABA KHQR</span>
        <button className="pw-close-new" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={17} />
        </button>
      </div>

      <div className="pw-body-new">
        <div className="pw-ticket" style={txn.qrImage ? { padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' } : {}}>
          {txn.qrImage ? (
            <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.14)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <img src={txn.qrImage} alt="KHQR" style={{ width: '100%', display: 'block', filter: 'contrast(1.22) saturate(1.35) brightness(0.98)', imageRendering: 'high-quality' }} />
              
              {txn.abapayDeeplink && (
                <div style={{ textAlign: 'center', marginTop: '12px', marginBottom: '12px' }}>
                  <a href={txn.abapayDeeplink} className="pw-btn-outline" style={{ display: 'inline-block', padding: '8px 16px', fontSize: '0.9rem', textDecoration: 'none' }}>
                    Open ABA Mobile
                  </a>
                </div>
              )}
              
              <p className="pw-scan-note" style={{ padding: '16px', margin: 0 }}>
                Scan with Bakong App or Mobile Banking app<br/>that support KHQR
              </p>
            </div>
          ) : (
            <>
              <div className="pw-ticket-red">
                 <span className="with-icon" style={{ fontWeight: 800 }}>
                   <Icon name="qr" size={16} strokeWidth={2.5} /> KHQR
                 </span>
              </div>
              
              <div className="pw-ticket-amount">
                <span className="pw-merchant">{merchant}</span>
                <b>{amountLine.replace('USD', '').trim()}</b>
              </div>
              
              <div className="pw-ticket-dash" />
              <div className="pw-qr-wrap">
                <QrGlyph token={txn.tran_id} label="KHQR" />
                <div className="pw-qr-logo">
                   <span>$</span>
                </div>
              </div>
              
              {txn.abapayDeeplink && (
                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                  <a href={txn.abapayDeeplink} className="pw-btn-outline" style={{ display: 'inline-block', padding: '8px', fontSize: '0.8rem', textDecoration: 'none' }}>
                    Open ABA Mobile
                  </a>
                </div>
              )}
              
              <p className="pw-scan-note">
                Scan with Bakong App or Mobile Banking app<br/>that support KHQR
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )

  const sheet = (
    <div
      className="pw-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="ABA PayWay checkout"
      tabIndex={-1}
      ref={sheetRef}
      onClick={(e) => e.stopPropagation()}
    >
      {sheetContent}
    </div>
  )

  return (
    <div className="pw-scrim" onClick={onClose}>
      <div className="relative w-full max-w-[320px] flex justify-center">
        <div className="pw-scrim-logo">
          <span style={{ opacity: 0.9 }}>ABA'</span> <i>PAYWAY</i>
        </div>
        {sheet}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ steps */


function SuccessScreen({ bookingId }) {
  return (
    <div className="pw-success">
      <div className="pw-success-top">
        <svg viewBox="0 0 320 160" width="100%" height="160" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#EAF6FF" />
              <stop offset="100%" stopColor="#D1EDFF" />
            </linearGradient>
          </defs>
          <rect width="320" height="160" fill="url(#sky)" />
          <path d="M40 50 Q50 30 70 40 Q80 35 90 45 Q90 55 70 55 L40 55 Z" fill="#FFFFFF" opacity="0.8" />
          <path d="M250 60 Q260 40 280 50 Q290 45 300 55 Q300 65 280 65 L250 65 Z" fill="#FFFFFF" opacity="0.8" />
          <path d="M0 120 Q80 100 160 130 T320 110 L320 160 L0 160 Z" fill="#BBE2FA" opacity="0.7" />
          <path d="M0 140 Q100 120 200 145 T320 130 L320 160 L0 160 Z" fill="#A5D8F9" />
          <g stroke="#4C80C5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <line x1="70" y1="130" x2="70" y2="100" />
            <path d="M60 110 L60 115 A 5 5 0 0 0 70 120" />
            <path d="M80 105 L80 110 A 5 5 0 0 1 70 115" />
          </g>
          <g stroke="#B0C4DE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <line x1="250" y1="140" x2="250" y2="115" />
            <path d="M243 125 L243 130 A 3 3 0 0 0 250 133" />
            <path d="M257 122 L257 127 A 3 3 0 0 1 250 130" />
          </g>
          <line x1="160" y1="150" x2="160" y2="40" stroke="#0072CE" strokeWidth="2" />
          <polygon points="157 40, 163 40, 160 44" fill="#0072CE" />
          <path d="M160 50 L240 50 L240 90 L160 90 Z" fill="#FFFFFF" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.05))" />
          <path d="M240 50 L255 55 L255 85 L240 90 Z" fill="#FFFFFF" opacity="0.9" />
          <circle cx="200" cy="70" r="16" fill="#48C58F" />
          <path d="M193 70 L198 75 L208 65" stroke="#FFFFFF" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="pw-success-body">
        <h2 className="pw-success-title">Success</h2>
        <p className="pw-success-desc">
          Order confirmation details sent to your email:<br/>
          <b>payer@email.com</b>
        </p>
        <div className="pw-success-actions">
          {/* The ticket is what the buyer actually came for, so this goes to the
              booking that carries it - /my-bookings only if we somehow have no
              id to send them to. */}
          <button
            type="button"
            className="pw-btn-outline"
            onClick={() => {
              window.location.href = bookingId ? `/bookings/${bookingId}` : '/my-bookings'
            }}
          >
            View your ticket
          </button>
          <button type="button" className="pw-btn-solid" onClick={() => window.location.href = '/'}>Continue Shopping</button>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- panels */

// Panel removed since we merged it into the ticket.

