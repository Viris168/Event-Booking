import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ActiveFilters,
  Alert,
  Badge,
  Empty,
  Field,
  IconSelect,
  ResponsiveTable,
} from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { timeAgo, usd } from '../../lib/format.js'
import { listPayments, useStore } from '../../mock/store.js'
import { getRefundQueue, approveRefund, rejectRefund } from '../../api/refunds.js'
import { mapBooking } from '../../api/adapters.js'

const PROVIDERS = ['BAKONG_KHQR', 'ABA_PAYWAY']
const STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED']

export default function AdminPaymentsPage() {
  useStore()
  const { t, locale, dateTime } = useLocale()
  useDocumentTitle(t('payments'))
  const toast = useToast()
  const [params] = useSearchParams()

  const [provider, setProvider] = useState('')
  const [status, setStatus] = useState('')
  const [stuckOnly, setStuckOnly] = useState(params.get('stuck') === '1')

  const payments = listPayments({ provider, status, stuckOnly })

  const km = locale === 'km'
  const chips = [
    provider && {
      key: 'provider',
      icon: 'card',
      label: provider,
      onRemove: () => setProvider(''),
    },
    status && { key: 'status', icon: 'filter', label: status, onRemove: () => setStatus('') },
    stuckOnly && {
      key: 'stuck',
      icon: 'alert',
      label: km ? 'ជាប់' : 'Stuck only',
      onRemove: () => setStuckOnly(false),
    },
  ].filter(Boolean)

  function clearAll() {
    setProvider('')
    setStatus('')
    setStuckOnly(false)
  }

  /*
   * The refund queue is live, unlike the payments table above it, which still
   * reads the prototype store because there is no admin payments endpoint yet.
   *
   * It had to be: the approve button below used to call the prototype store's
   * approveRefund, so an admin saw "Refund approved" while the customer's
   * booking stayed CONFIRMED and nobody was ever refunded.
   */
  const [refundRequests, setRefundRequests] = useState([])
  const [deciding, setDeciding] = useState(null)

  const loadQueue = useCallback(() => {
    getRefundQueue()
      .then((res) => setRefundRequests((res || []).map(mapBooking)))
      // A non-admin gets 403 here; showing an empty queue is the right outcome
      // either way, and this page is already behind an admin route.
      .catch(() => setRefundRequests([]))
  }, [])

  useEffect(loadQueue, [loadQueue])

  function decide(bookingId, action, successMessage) {
    if (deciding) return
    setDeciding(bookingId)
    action(bookingId)
      .then(() => {
        // Drop the row immediately rather than waiting for the refetch: the
        // booking has left REFUND_REQUESTED, so it is no longer in this queue.
        setRefundRequests((prev) => prev.filter((b) => b.id !== bookingId))
        toast(successMessage, 'success')
      })
      .catch((err) => {
        const detail = err.response?.data?.detail || err.response?.data?.message || err.message
        toast(`Could not update that refund (${detail})`, 'error')
        // Something else moved the booking — another admin working the same
        // queue is the ordinary way here — so resync rather than guess.
        loadQueue()
      })
      .finally(() => setDeciding(null))
  }

  const totals = payments.reduce(
    (acc, p) => ({
      count: acc.count + 1,
      success: acc.success + (p.status === 'SUCCESS' ? p.amount_usd_cents : 0),
      pending: acc.pending + (['PENDING', 'CREATED'].includes(p.status) ? p.amount_usd_cents : 0),
    }),
    { count: 0, success: 0, pending: 0 },
  )

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('payments')}</h1>
          <p>
            {totals.count} {locale === 'km' ? 'ប្រតិបត្តិការ' : 'transactions'} ·{' '}
            {usd(totals.success)} {locale === 'km' ? 'ជោគជ័យ' : 'settled'} · {usd(totals.pending)}{' '}
            {locale === 'km' ? 'រង់ចាំ' : 'in flight'}
          </p>
        </div>
      </div>

      {refundRequests.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <Alert tone="info" title={`${refundRequests.length} ${t('requestRefund').toLowerCase()}`}>
            <div className="stack-sm" style={{ marginTop: '0.5rem' }}>
              {refundRequests.map((b) => (
                <div className="spread small" key={b.id}>
                  <Link className="mono" to={`/bookings/${b.id}`}>
                    {b.booking_ref}
                  </Link>
                  <span>{b.buyer_name}</span>
                  <span className="font-bold">{usd(b.total_usd_cents)}</span>
                  <span className="row" style={{ gap: '0.4rem' }}>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={deciding === b.id}
                      onClick={() =>
                        decide(
                          b.id,
                          approveRefund,
                          locale === 'km' ? 'បានសងប្រាក់វិញ' : 'Refund approved — seats back on sale.',
                        )
                      }
                    >
                      {locale === 'km' ? 'អនុម័តសងប្រាក់' : 'Approve refund'}
                    </button>
                    {/*
                      Declining was previously unreachable: the prototype store
                      had no reject path, so a request an admin judged invalid
                      just sat in the banner forever. REFUND_REQUESTED ->
                      CONFIRMED is on the state machine, and the tickets were
                      never invalidated, so this simply puts it back.
                    */}
                    <button
                      className="btn btn-sm btn-outline"
                      disabled={deciding === b.id}
                      onClick={() =>
                        decide(
                          b.id,
                          rejectRefund,
                          locale === 'km' ? 'បានបដិសេធ' : 'Refund declined — the tickets stay valid.',
                        )
                      }
                    >
                      {locale === 'km' ? 'បដិសេធ' : 'Decline'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </Alert>
        </div>
      )}

      <div className="panel" style={{ marginBottom: '1.2rem' }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={km ? 'អ្នកផ្តល់សេវា' : 'Provider'}>
              <IconSelect
                icon="card"
                value={provider}
                onChange={setProvider}
                ariaLabel={km ? 'អ្នកផ្តល់សេវា' : 'Provider'}
              >
                <option value="">{km ? 'ទាំងអស់' : 'All providers'}</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={t('status')}>
              <IconSelect icon="filter" value={status} onChange={setStatus} ariaLabel={t('status')}>
                <option value="">{km ? 'ទាំងអស់' : 'All statuses'}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={t('reconciliation')}>
              <button
                className={`chip ${stuckOnly ? 'active' : ''}`}
                onClick={() => setStuckOnly((v) => !v)}
                style={{ height: 42 }}
              >
                {stuckOnly
                  ? locale === 'km'
                    ? 'បង្ហាញតែអ្វីដែលជាប់'
                    : 'Showing stuck only'
                  : locale === 'km'
                    ? 'ត្រងអ្វីដែលជាប់'
                    : 'Filter to stuck'}
              </button>
            </Field>
          </div>

          {chips.length > 0 && (
            <div style={{ marginTop: '0.85rem' }}>
              <ActiveFilters items={chips} onClearAll={clearAll} clearAllLabel={t('reset')} />
            </div>
          )}
        </div>
      </div>

      {payments.length === 0 ? (
        <Empty
          icon={stuckOnly ? 'checkCircle' : 'search'}
          title={
            stuckOnly
              ? km
                ? 'គ្មានការទូទាត់ជាប់ទេ'
                : 'Nothing stuck'
              : km
                ? 'រកមិនឃើញការទូទាត់ទេ'
                : 'No payments match'
          }
        >
          {stuckOnly
            ? km
              ? 'រាល់ការទូទាត់ដែលកំពុងរង់ចាំនៅតែស្ថិតក្នុងកម្រិតធម្មតា។'
              : 'Every pending attempt is still inside the one-hour window.'
            : km
              ? 'សាកល្បងលុបតម្រងចេញ។'
              : 'Try clearing a filter.'}
          {chips.length > 0 && (
            <button className="btn btn-sm btn-outline" onClick={clearAll} style={{ marginTop: '0.7rem' }}>
              {t('reset')}
            </button>
          )}
        </Empty>
      ) : (
      <div className="panel">
        <ResponsiveTable>
          <table className="table">
            <thead>
              <tr>
                <th>{km ? 'អ្នកផ្តល់សេវា' : 'Provider'}</th>
                <th>Provider ref</th>
                <th>Booking</th>
                <th>{t('status')}</th>
                <th className="num">{locale === 'km' ? 'ទឹកប្រាក់' : 'Amount'}</th>
                <th>{locale === 'km' ? 'បង្កើត' : 'Created'}</th>
                <th>{locale === 'km' ? 'ដោះស្រាយ' : 'Resolved'}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className={p.stuck ? 'flagged' : ''}>
                  <td>
                    <div className="small font-bold">{p.provider === 'BAKONG_KHQR' ? 'Bakong KHQR' : 'ABA PayWay'}</div>
                    <div className="small muted">{p.currency_charged}</div>
                  </td>
                  <td className="mono small">{p.provider_ref || '—'}</td>
                  <td>
                    <Link className="mono small" to={`/bookings/${p.booking_id}`}>
                      {p.booking?.booking_ref}
                    </Link>
                    <div className="small muted">
                      {locale === 'km' ? p.event?.title_km : p.event?.title_en}
                    </div>
                  </td>
                  <td>
                    <div className="row row-tight">
                      <Badge status={p.status} />
                      {p.stuck && <span className="badge badge-warm">⚠︎ {t('reconciliation')}</span>}
                    </div>
                  </td>
                  <td className="num font-bold">{usd(p.amount_usd_cents)}</td>
                  <td className="small muted" title={dateTime(p.created_at)}>
                    {timeAgo(p.created_at)}
                  </td>
                  <td className="small muted">{p.resolved_at ? timeAgo(p.resolved_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
</ResponsiveTable>
      </div>
      )}

      <p className="hint" style={{ marginTop: '0.8rem' }}>
        {locale === 'km'
          ? 'ជួរដេកដែលដាក់សម្គាល់ = រង់ចាំលើស ១ ម៉ោង ដោយគ្មាន webhook។'
          : 'Highlighted rows have been pending for over an hour with no provider webhook — the reconciliation flag.'}
      </p>
    </div>
  )
}
