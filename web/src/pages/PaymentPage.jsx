import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import Icon from '../components/Icon.jsx'
import KhqrCard from '../components/KhqrCard.jsx'
import PaywayCheckout from '../components/PaywayCheckout.jsx'
import BakongCheckout from '../components/BakongCheckout.jsx'
import { CheckoutSkeleton } from '../components/Skeleton.jsx'
import { Alert } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown } from '../lib/format.js'
import { mapBooking } from '../api/adapters.js'
import {
  startPayment as startApiPayment,
  pollPayment,
  getBookingPayments,
  simulateAbaPayment,
  simulateBakongPayment,
} from '../api/payment.js'
import { MERCHANT_NAME, PROVIDER } from '../lib/payway.js'
import { getBooking, useStore } from '../mock/store.js'
import { getBooking as getApiBooking } from '../api/bookings.js'

// How each payment_status reads on screen.
const STRIP = {
  PENDING: { tone: 'wait', key: 'waitingForPayment' },
  SUCCESS: { tone: 'ok', key: 'paymentReceived' },
  FAILED: { tone: 'bad', key: 'paymentFailedMsg' },
  CANCELLED: { tone: 'neutral', key: 'paymentCancelled' },
  EXPIRED: { tone: 'neutral', key: 'transactionExpired' },
}

export default function PaymentPage() {
  const { bookingId } = useParams()
  const [params] = useSearchParams()
  useStore()
  const { t } = useLocale()
  const navigate = useNavigate()

  const [apiBooking, setApiBooking] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(true)

  const [txn, setTxn] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [checking, setChecking] = useState(false) // Check Transaction in flight
  const [now, setNow] = useState(() => Date.now()) // drives the lifetime countdown
  const onSettledRef = useRef(() => {})

  useEffect(() => {
    let active = true
    getApiBooking(bookingId)
      .then((res) => {
        if (active && res) setApiBooking(mapBooking(res))
      })
      .catch(() => {})
      .finally(() => {
        if (active) setBookingLoading(false)
      })
    return () => { active = false }
  }, [bookingId])

  const mockBooking = !bookingLoading && !apiBooking ? getBooking(bookingId) : null
  const booking = apiBooking ?? mockBooking
  useDocumentTitle(booking ? `${t('checkout')} · ${booking.booking_ref}` : null)

  const requestedOption = params.get('option')

  const status =
    txn?.status ||
    { CONFIRMED: 'SUCCESS', PAYMENT_FAILED: 'FAILED', CANCELLED: 'CANCELLED' }[booking?.state] ||
    'PENDING'

  /** Create Transaction */
  const openTransaction = useCallback(
    async (provider) => {
      if (!booking || !apiBooking) return
      
      try {
        const data = await startApiPayment(apiBooking.id, provider);
        setTxn(data)
        setChecking(false)
        if (provider === 'ABA_PAYWAY' || provider === 'BAKONG_KHQR') {
          setSheetOpen(true)
        }
      } catch (err) {
        console.error("Failed to generate payment:", err)
        alert("Failed to generate payment. See browser console for details: " + err.message)
      }
    },
    [booking, apiBooking],
  )

  const refreshBooking = useCallback(() => {
    if (!apiBooking) return
    getApiBooking(apiBooking.id)
      .then((res) => {
        if (res) setApiBooking(mapBooking(res))
      })
      .catch(() => {})
  }, [apiBooking?.id])

  useEffect(() => {
    if (!booking || txn) return
    // PAYMENT_FAILED is retryable: the backend lets a failed/expired booking
    // open a fresh attempt, so "Try again" must do the same on this side.
    if (booking.state === 'PENDING_PAYMENT' || booking.state === 'PAYMENT_FAILED' || booking.state === 'AWAITING_CONFIRMATION' || !booking.state) {
      if (requestedOption) {
        openTransaction(requestedOption)
        return
      }

      /*
       * No provider named, so resume whatever is already open rather than
       * defaulting to ABA.
       *
       * The default was not merely cosmetic. The server closes an open attempt
       * whenever a DIFFERENT provider is requested, so arriving here from
       * "Reopen payment" on a pending Bakong booking cancelled the KHQR attempt
       * and started an ABA one — a customer who had already scanned and was
       * waiting on Bakong lost that attempt just by looking at the page.
       *
       * Asking for the same provider is safe: the server hands back the SAME
       * QR and reference instead of creating anything.
       */
      let cancelled = false
      getBookingPayments(apiBooking?.id ?? bookingId)
        .then((list) => {
          if (cancelled) return
          const open = (list || []).find((p) =>
            ['PENDING', 'CREATED'].includes(p.status ?? p.state),
          )
          openTransaction(open?.provider || 'ABA_PAYWAY')
        })
        .catch(() => !cancelled && openTransaction('ABA_PAYWAY'))
      return () => {
        cancelled = true
      }
    }
  }, [booking, txn, requestedOption, openTransaction, apiBooking?.id, bookingId])

  useEffect(() => {
    if (txn?.status === 'PENDING' && txn?.provider === 'ABA_PAYWAY') setSheetOpen(true)
  }, [txn?.status, txn?.provider])

  // Poll for completion
  useEffect(() => {
    if ((txn?.status !== 'PENDING' && txn?.status !== 'CREATED') || !txn?.id) return
    const timer = setInterval(() => {
      pollPayment(txn.id).then(data => {
        if (data && data.status === 'SUCCESS') {
          onSettledRef.current('SUCCESS')
          if (data.bookingState && data.bookingState !== 'CONFIRMED') {
            console.error('Payment approved but booking is', data.bookingState)
          }
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

  // A purchase only lives for its `lifetime`
  useEffect(() => {
    if (txn?.status !== 'PENDING' && txn?.status !== 'CREATED') return
    const expiresAt = txn.expires_at ?? txn.expiresAt
    const tick = setInterval(() => {
      setNow(Date.now())
      if (Date.parse(expiresAt) <= Date.now()) onSettledRef.current('EXPIRED')
    }, 1000)
    return () => clearInterval(tick)
  }, [txn?.status, txn?.expires_at, txn?.expiresAt])

  const onSettled = useCallback(
    (status, { simulated = false } = {}) => {
      if (!booking) return

      if (status === 'SUCCESS') {
        setSheetOpen(false)
        setTxn((prev) =>
          prev ? { ...prev, status, resolved_at: new Date().toISOString() } : null,
        )
        if (simulated && apiBooking && txn?.id) {
          setChecking(true)
          const simCall = txn.provider === 'BAKONG_KHQR'
              ? simulateBakongPayment(txn.id)
              : simulateAbaPayment(txn.providerRef ?? txn.provider_ref)

          simCall
            .then(refreshBooking)
            .then(() => navigate(`/bookings/${booking.id}`))
            .catch((err) => console.error('Simulated settlement failed', err))
            .finally(() => setChecking(false))
        } else {
          // Real settlement came from polling check-transaction - straight to
          // the tickets, the way PayWay's skip-success-page flow ends.
          navigate(`/bookings/${booking.id}`)
        }
        return
      }

      setTxn((prev) =>
        prev
          ? { ...prev, status, resolved_at: new Date().toISOString() }
          : null,
      )
      setSheetOpen(false)
    },
    [booking, apiBooking, txn?.id, txn?.provider, txn?.providerRef, txn?.provider_ref, refreshBooking, navigate],
  )
  onSettledRef.current = onSettled

  if (bookingLoading) {
    return <CheckoutSkeleton />
  }

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

  const strip = STRIP[status] || STRIP.PENDING
  const isOpen = status === 'PENDING' || status === 'CREATED'

  // Map the unified txn object to the shape PaywayCheckout expects. The API
  // responds snake_case, so read both shapes until the client normalizes.
  const checkoutTxn = txn && txn.provider === 'ABA_PAYWAY' ? {
    ...txn,
    tran_id: txn.providerRef ?? txn.provider_ref,
    amount_usd_cents: booking.total_usd_cents,
    qrImage: txn.qrPayload ?? txn.qr_payload,
    checkoutAction: txn.checkoutAction ?? txn.checkout_action,
    checkoutFields: txn.checkoutFields ?? txn.checkout_fields,
    expires_at: txn.expiresAt ?? txn.expires_at
  } : null

  let checkout = null
  if (checkoutTxn) {
    checkout = (
      <PaywayCheckout
        txn={checkoutTxn}
        merchant={MERCHANT_NAME}
        onSettled={(abaStatus, opts) => {
          // Map ABA's APPROVED back to unified SUCCESS
          const mappedStatus = abaStatus === 'APPROVED' ? 'SUCCESS' : abaStatus
          onSettled(mappedStatus, opts)
        }}
        onClose={() => setSheetOpen(false)}
      />
    )
  } else if (txn && txn.provider === 'BAKONG_KHQR') {
    checkout = (
      <BakongCheckout
        txn={txn}
        booking={booking}
        onSettled={onSettled}
        onClose={() => setSheetOpen(false)}
      />
    )
  }

  return (
    <>
      {sheetOpen && checkout}

      {/* Create Transaction is still in flight — the popup opens by itself the
          moment it answers. */}
      {!sheetOpen && !txn && isOpen && <CheckoutSkeleton />}

      {!sheetOpen && (txn || !isOpen) && (
        <div className="container container-narrow">
          <div className="panel pw-launch">
            <div className="panel-body stack-sm text-center" style={{ alignItems: 'center' }}>
              <span className="icon-chip lg">
                <Icon name="qr" size={22} />
              </span>
              <strong>{txn?.provider || 'Payment'}</strong>
              <p className="small muted">
                {checking
                  ? t('checkingTransaction')
                  : isOpen
                    ? t('paywayHandoff')
                    : t(strip.key)}
              </p>
              {isOpen ? (
                <button className="btn pw-pay btn-block" onClick={() => setSheetOpen(true)}>
                  <Icon name="lock" size={15} />
                  {t('openCheckout')}
                </button>
              ) : status === 'SUCCESS' ? (
                <Link className="btn btn-primary btn-block" to={`/bookings/${booking.id}`}>
                  <Icon name="ticket" size={15} />
                  {t('yourTickets')}
                </Link>
              ) : (
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    setTxn(null)
                  }}
                >
                  <Icon name="refresh" size={15} />
                  {t('tryAgain')}
                </button>
              )}
              {isOpen && txn && (
                <span className="small muted with-icon">
                  <Icon name="clock" size={13} />
                  {t('completeWithin')} {countdown(Date.parse(txn.expires_at ?? txn.expiresAt) - now)}
                </span>
              )}
              <Link className="small with-icon" to={`/bookings/${booking.id}`}>
                {t('bookingRef')} {booking.booking_ref}
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
