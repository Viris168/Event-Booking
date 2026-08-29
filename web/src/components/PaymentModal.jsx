import { useCallback, useEffect, useRef, useState } from 'react'
import { startPayment as startApiPayment, pollPayment, simulateAbaPayment, simulateBakongPayment } from '../api/payment.js'
import PaywayCheckout from './PaywayCheckout.jsx'
import BakongCheckout from './BakongCheckout.jsx'
import { MERCHANT_NAME } from '../lib/payway.js'
import { getBooking as getApiBooking } from '../api/bookings.js'
import { mapBooking } from '../api/adapters.js'
import { CheckoutSkeleton } from './Skeleton.jsx'

export default function PaymentModal({ bookingId, option, onSuccess, onClose }) {
  const [apiBooking, setApiBooking] = useState(null)
  const [txn, setTxn] = useState(null)
  const [checking, setChecking] = useState(false)
  const onSettledRef = useRef(() => {})

  // 1. Fetch booking details when mounted
  useEffect(() => {
    let active = true
    getApiBooking(bookingId)
      .then((res) => {
        if (active && res) setApiBooking(mapBooking(res))
      })
      .catch((err) => console.error("Failed to load booking for payment", err))
    return () => { active = false }
  }, [bookingId])

  // 2. Start transaction once booking is loaded and we have an option
  useEffect(() => {
    if (!apiBooking || txn) return
    let active = true
    startApiPayment(apiBooking.id, option)
      .then(data => {
        if (active) setTxn(data)
      })
      .catch(err => {
        console.error("Failed to generate payment:", err)
        if (active) {
          alert("Failed to generate payment: " + err.message)
          onClose()
        }
      })
    return () => { active = false }
  }, [apiBooking, option, txn, onClose])

  const refreshBooking = useCallback(() => {
    if (!apiBooking) return
    getApiBooking(apiBooking.id)
      .then((res) => {
        if (res) setApiBooking(mapBooking(res))
      })
      .catch(() => {})
  }, [apiBooking?.id])

  // 3. Poll for completion
  useEffect(() => {
    if ((txn?.status !== 'PENDING' && txn?.status !== 'CREATED') || !txn?.id) return
    const timer = setInterval(() => {
      pollPayment(txn.id).then(data => {
        if (data && data.status === 'SUCCESS') {
          onSettledRef.current('SUCCESS')
          refreshBooking()
        } else if (data && data.status === 'EXPIRED') {
          onSettledRef.current('EXPIRED')
          refreshBooking()
        } else if (data && data.status === 'FAILED') {
          onSettledRef.current('FAILED')
          refreshBooking()
        }
      }).catch(err => console.error(err))
    }, 3000)
    return () => clearInterval(timer)
  }, [txn?.status, txn?.id, refreshBooking])

  // 4. Handle Settlement
  const onSettled = useCallback(
    (status, { simulated = false } = {}) => {
      if (!apiBooking) return

      if (status === 'SUCCESS') {
        setTxn((prev) => prev ? { ...prev, status: 'SUCCESS', resolved_at: new Date().toISOString() } : null)

        if (simulated && txn?.id) {
          setChecking(true)
          const simCall = txn.provider === 'BAKONG_KHQR'
              ? simulateBakongPayment(txn.id)
              : simulateAbaPayment(txn.providerRef ?? txn.provider_ref)

          simCall
            .then(refreshBooking)
            .then(() => {
              if (txn.provider !== 'ABA_PAYWAY') onSuccess()
            })
            .catch((err) => console.error('Simulated settlement failed', err))
            .finally(() => setChecking(false))
        } else {
          if (txn.provider !== 'ABA_PAYWAY') {
            onSuccess()
          }
        }
        return
      }

      setTxn((prev) =>
        prev
          ? { ...prev, status, resolved_at: new Date().toISOString() }
          : null,
      )
      // If it failed or was cancelled by user, just close the modal
      if (status === 'CANCELLED') {
        onClose()
      }
    },
    [apiBooking, txn?.id, txn?.provider, txn?.providerRef, txn?.provider_ref, refreshBooking, onSuccess, onClose],
  )
  onSettledRef.current = onSettled

  // 5. Render
  if (!txn) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckoutSkeleton />
      </div>
    )
  }

  // Map ABA txn
  const checkoutTxn = txn.provider === 'ABA_PAYWAY' ? {
    ...txn,
    tran_id: txn.providerRef ?? txn.provider_ref,
    amount_usd_cents: apiBooking?.total_usd_cents,
    qrImage: txn.qrPayload ?? txn.qr_payload,
    checkoutAction: txn.checkoutAction ?? txn.checkout_action,
    checkoutFields: txn.checkoutFields ?? txn.checkout_fields,
    expires_at: txn.expiresAt ?? txn.expires_at
  } : null

  return (
    <>
      {checkoutTxn ? (
        <PaywayCheckout
          txn={checkoutTxn}
          merchant={MERCHANT_NAME}
          onSettled={(abaStatus, opts) => {
            const mappedStatus = abaStatus === 'APPROVED' ? 'SUCCESS' : abaStatus
            onSettled(mappedStatus, opts)
          }}
          onClose={onClose}
        />
      ) : txn.provider === 'BAKONG_KHQR' ? (
        <BakongCheckout
          txn={txn}
          booking={apiBooking}
          onSettled={onSettled}
          onClose={onClose}
        />
      ) : null}
    </>
  )
}
