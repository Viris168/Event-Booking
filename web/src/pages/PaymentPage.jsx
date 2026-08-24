import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import PaywayCheckout from '../components/PaywayCheckout.jsx'
import { CheckoutSkeleton } from '../components/Skeleton.jsx'
import { Alert } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown } from '../lib/format.js'
import { mapBooking } from '../api/adapters.js'
import { createQr, checkStatus, simulatePayment } from '../api/payment.js'
import { loadTransaction, MERCHANT_NAME, PROVIDER, paymentOption, optionTitle } from '../lib/payway.js'
import { getBooking, resolvePayment, startPayment, useStore } from '../mock/store.js'
import { getBooking as getApiBooking } from '../api/bookings.js'

// How each PayWay payment_status reads on screen.
const STRIP = {
  PENDING: { tone: 'wait', key: 'waitingForPayment' },
  APPROVED: { tone: 'ok', key: 'paymentReceived' },
  DECLINED: { tone: 'bad', key: 'paymentFailedMsg' },
  CANCELLED: { tone: 'neutral', key: 'paymentCancelled' },
  EXPIRED: { tone: 'neutral', key: 'transactionExpired' },
}

/**
 * The merchant side of PayWay's eCommerce checkout.
 *
 * It creates the transaction, opens PayWay's checkout over this page — a modal
 * on desktop, a bottom sheet on phones — then does what the merchant server
 * does once the buyer is done: run Check Transaction until the status is final,
 * and treat the return_url callback as the result of record.
 */
export default function PaymentPage() {
  const { bookingId } = useParams()
  const [params] = useSearchParams()
  useStore()
  const { t, locale } = useLocale()
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

  // Only the pure-prototype path has a mock booking; an API booking id must
  // never be used to write into the seeded store.
  const mockBooking = !bookingLoading && !apiBooking ? getBooking(bookingId) : null
  const booking = apiBooking ?? mockBooking
  useDocumentTitle(booking ? `${t('checkout')} · ${booking.booking_ref}` : null)

  const requestedOption = params.get('option')

  // With no attempt in hand the booking's own state says how the last one ended.
  const status =
    txn?.status ||
    { CONFIRMED: 'APPROVED', PAYMENT_FAILED: 'DECLINED', CANCELLED: 'CANCELLED' }[booking?.state] ||
    'PENDING'

  /** Create Transaction — one open purchase per booking. */
  const openTransaction = useCallback(
    async (option) => {
      if (!booking) return
      
      try {
        const payload = {
          firstname: booking.buyer_name ? booking.buyer_name.split(' ')[0] : 'Sina',
          lastname: booking.buyer_name ? booking.buyer_name.split(' ').slice(1).join(' ') : 'Chhum',
          amount: (booking.total_usd_cents / 100).toFixed(2),
          currency: 'USD',
          phone: booking.buyer_phone_e164 || '093939399',
          // What the transaction is paying for. The server needs it to confirm
          // the booking and issue its tickets when PayWay approves — without it
          // the payment succeeds and nothing downstream ever happens. Sent only
          // for a real booking: a prototype-store id names no row in the API's
          // database.
          ...(apiBooking ? { booking_id: apiBooking.id } : {}),
        };
        const data = await createQr(payload);
        
        const tranId = data.status?.tranId || data.status?.tran_id || data.tran_id || 'unknown';
        const next = {
          tran_id: tranId,
          payment_option: option,
          amount_usd_cents: booking.total_usd_cents,
          status: 'PENDING',
          expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
          created_at: new Date().toISOString(),
          qrImage: data.qrImage,
          abapayDeeplink: data.abapayDeeplink || data.abapay_deeplink
        };
        
        if (mockBooking) startPayment(mockBooking.id, PROVIDER)
        setTxn(next)
        setChecking(false)
        setSheetOpen(true)
      } catch (err) {
        console.error("Failed to generate QR:", err)
        alert("Failed to generate QR Code. See browser console for details: " + err.message)
      }
    },
    [booking, apiBooking, mockBooking],
  )

  /**
   * Re-reads the booking after a settlement. The API confirms the booking and
   * issues the tickets inside the same call that reports the payment as paid,
   * so by the time this runs the state is already CONFIRMED — this is what puts
   * that on screen instead of the stale PENDING_PAYMENT badge.
   */
  const refreshBooking = useCallback(() => {
    if (!apiBooking) return
    getApiBooking(apiBooking.id)
      .then((res) => {
        if (res) setApiBooking(mapBooking(res))
      })
      .catch(() => {})
  }, [apiBooking?.id])

  // Pick up an attempt left open by an earlier visit, or start the one the
  // checkout page asked for.
  useEffect(() => {
    if (!booking || txn) return
    const existing = loadTransaction(booking.id)
    if (existing) {
      setTxn(existing)
      setSheetOpen(existing.status === 'PENDING')
    } else if (booking.state === 'PENDING_PAYMENT' || !booking.state) {
      openTransaction(requestedOption || undefined)
    }
  }, [booking, txn, requestedOption, openTransaction])

  // The purchase page should immediately show PayWay's popup once its pending
  // transaction is ready. This also covers a pending transaction restored from
  // session storage after a page refresh.
  useEffect(() => {
    if (txn?.status === 'PENDING') setSheetOpen(true)
  }, [txn?.status])

  // Check Transaction: poll until the gateway gives a final answer.
  useEffect(() => {
    if (txn?.status !== 'PENDING' || !txn?.tran_id) return
    const timer = setInterval(() => {
      checkStatus(txn.tran_id).then(data => {
        if (data && data.paid === true) {
          onSettledRef.current('APPROVED')
          // The same response says what the booking became. Anything other than
          // CONFIRMED means the money landed but the booking could not take it
          // — an expired or cancelled booking — and the tickets will not exist.
          if (data.bookingState && data.bookingState !== 'CONFIRMED') {
            console.error('Payment approved but booking is', data.bookingState)
          }
          refreshBooking()
        }
      }).catch(err => console.error(err))
    }, 3000)
    return () => clearInterval(timer)
  }, [txn?.status, txn?.tran_id, refreshBooking])

  // A purchase only lives for its `lifetime`; past that PayWay stops accepting it.
  useEffect(() => {
    if (txn?.status !== 'PENDING') return
    const tick = setInterval(() => {
      setNow(Date.now())
      if (Date.parse(txn.expires_at) <= Date.now()) onSettledRef.current('EXPIRED')
    }, 1000)
    return () => clearInterval(tick)
  }, [txn?.status, txn?.expires_at])

  // Once the money lands, we wait for the user to click "View Tickets" on the success screen.
  // We used to auto-navigate here, but now PaywayCheckout handles it via onSuccess.

  /**
   * The buyer finished inside the checkout — PayWay closes it and posts back.
   *
   * @param simulated true when the outcome came from the checkout's simulate
   *   buttons rather than from ABA. A simulated approval has to be settled on
   *   the server explicitly: no money moved, so check-transaction would go on
   *   answering "not paid" and the booking would never confirm.
   */
  const onSettled = useCallback(
    (status, { simulated = false } = {}) => {
      if (!booking) return

      if (simulated && status === 'APPROVED' && apiBooking && txn?.tran_id) {
        setChecking(true)
        simulatePayment(txn.tran_id)
          .then(refreshBooking)
          .catch((err) => console.error('Simulated settlement failed', err))
          .finally(() => setChecking(false))
      }

      setTxn((prev) =>
        prev
          ? {
              ...prev,
              status,
              status_code:
                { APPROVED: 0, PENDING: 2, DECLINED: 3, CANCELLED: 4, EXPIRED: 5 }[status] ?? 3,
              resolved_at: new Date().toISOString(),
            }
          : null,
      )
      if (status !== 'APPROVED') setSheetOpen(false)

      // The prototype store settles synchronously, on the outcome names its own
      // state machine uses. EXPIRED closes the attempt but leaves the booking
      // payable, so it maps straight through rather than onto a cancellation.
      if (mockBooking) {
        resolvePayment(
          mockBooking.id,
          { APPROVED: 'SUCCESS', DECLINED: 'FAILED', CANCELLED: 'CANCELLED', EXPIRED: 'EXPIRED' }[
            status
          ],
        )
      }
    },
    [booking, apiBooking, mockBooking, txn?.tran_id, refreshBooking],
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
  const isOpen = status === 'PENDING'
  const option = paymentOption(txn?.payment_option)

  const checkout = txn ? (
    <PaywayCheckout
      txn={txn}
      merchant={MERCHANT_NAME}
      onSettled={onSettled}
      onClose={() => setSheetOpen(false)}
      onSuccess={() => navigate(`/bookings/${booking.id}`)}
    />
  ) : null

  return (
    <>
      {sheetOpen && checkout}

      {/* Create Transaction is still in flight — the popup opens by itself the
          moment it answers. */}
      {!sheetOpen && !txn && isOpen && <CheckoutSkeleton />}

      {/* PayWay's popup is the whole payment step. This is all that is left
          behind it when the buyer dismisses it — enough to reopen the checkout
          or start a fresh transaction, and nothing else. */}
      {!sheetOpen && (txn || !isOpen) && (
        <div className="container container-narrow">
          <div className="panel pw-launch">
            <div className="panel-body stack-sm text-center" style={{ alignItems: 'center' }}>
              <span className="icon-chip lg">
                <Icon name={option.icon} size={22} />
              </span>
              <strong>{optionTitle(option.id, locale)}</strong>
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
              ) : status === 'APPROVED' ? (
                // Paid already: the only thing left to do is collect the tickets.
                <Link className="btn btn-primary btn-block" to={`/bookings/${booking.id}`}>
                  <Icon name="ticket" size={15} />
                  {t('yourTickets')}
                </Link>
              ) : (
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => openTransaction(option.id)}
                >
                  <Icon name="refresh" size={15} />
                  {t('tryAgain')}
                </button>
              )}
              {isOpen && txn && (
                <span className="small muted with-icon">
                  <Icon name="clock" size={13} />
                  {t('completeWithin')} {countdown(Date.parse(txn.expires_at) - now)}
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
