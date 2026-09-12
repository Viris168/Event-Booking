import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import KhqrCard from './KhqrCard.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown } from '../lib/format.js'
import { MERCHANT_NAME } from '../lib/payway.js'

export default function BakongCheckout({ txn, booking, onClose }) {
  const { t } = useLocale()
  const sheetRef = useRef(null)
  const [now, setNow] = useState(() => Date.now())

  const left = txn ? Date.parse(txn.expiresAt ?? txn.expires_at) - now : 0
  const expired = left <= 0

  // Ticks so the QR stops accepting input the moment its lifetime runs out.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Esc closes the popup
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    sheetRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!txn) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-gray-900/60 p-4" onClick={onClose}>
      <div
        className="sheet dialog bg-transparent shadow-none w-auto max-w-none p-0"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex="-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {/* Close Button above the card */}
          <div className="flex justify-end mb-3">
            <button 
              className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
              onClick={onClose}
              aria-label={t('close')}
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <KhqrCard
            qrPayload={txn.qrPayload ?? txn.qr_payload}
            merchantName={MERCHANT_NAME}
            amountUsdCents={txn.amountUsdCents ?? txn.amount_usd_cents ?? booking?.total_usd_cents}
            amountKhr={txn.amountKhr ?? txn.amount_khr ?? booking?.total_khr}
            currency={txn.currencyCharged ?? txn.currency_charged ?? 'USD'}
            bookingRef={booking?.booking_ref}
            bookingRef={booking?.booking_ref}
          />

          <div className="mt-5 text-center px-4">
            <div className="flex items-center justify-center gap-2 text-sm text-white font-medium bg-gray-900/80 rounded-full py-2 px-4 shadow-lg backdrop-blur-md inline-flex mx-auto border border-gray-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              Waiting for Bakong payment...
            </div>
            <div className="mt-3 text-sm text-gray-300 drop-shadow-md">
              {expired ? (
                <span className="text-red-400 font-bold">QR Expired</span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Icon name="clock" size={14} /> Complete within {countdown(left)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
