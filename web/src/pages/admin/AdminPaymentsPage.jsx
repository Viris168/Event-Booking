import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, Badge, Field } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { timeAgo, usd } from '../../lib/format.js'
import { approveRefund, listBookings, listPayments, useStore } from '../../mock/store.js'
import { useAuth } from '../../context/AuthContext.jsx'

const PROVIDERS = ['BAKONG_KHQR', 'ABA_PAYWAY']
const STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED']

export default function AdminPaymentsPage() {
  useStore()
  const { t, locale, dateTime } = useLocale()
  const { user } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()

  const [provider, setProvider] = useState('')
  const [status, setStatus] = useState('')
  const [stuckOnly, setStuckOnly] = useState(params.get('stuck') === '1')

  const payments = listPayments({ provider, status, stuckOnly })
  const refundRequests = listBookings({ state: 'REFUND_REQUESTED' })

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
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      const r = approveRefund(b.id, user.id)
                      toast(
                        r.error ? r.error : locale === 'km' ? 'បានសងប្រាក់វិញ' : 'Refund approved',
                        r.error ? 'error' : 'success',
                      )
                    }}
                  >
                    {locale === 'km' ? 'អនុម័តសងប្រាក់' : 'Approve refund'}
                  </button>
                </div>
              ))}
            </div>
          </Alert>
        </div>
      )}

      <div className="panel" style={{ marginBottom: '1.2rem' }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={locale === 'km' ? 'អ្នកផ្តល់សេវា' : 'Provider'}>
              <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">{locale === 'km' ? 'ទាំងអស់' : 'All providers'}</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('status')}>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{locale === 'km' ? 'ទាំងអស់' : 'All statuses'}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'km' ? 'អ្នកផ្តល់សេវា' : 'Provider'}</th>
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
                  <td className="num font-bold">
                    {p.currency_charged === 'KHR'
                      ? `៛${p.amount_khr.toLocaleString('en-US')}`
                      : usd(p.amount_usd_cents)}
                  </td>
                  <td className="small muted" title={dateTime(p.created_at)}>
                    {timeAgo(p.created_at)}
                  </td>
                  <td className="small muted">{p.resolved_at ? timeAgo(p.resolved_at) : '—'}</td>
                </tr>
              ))}
              {!payments.length && (
                <tr>
                  <td colSpan="7" className="muted small">
                    {locale === 'km' ? 'គ្មានប្រតិបត្តិការ' : 'No transactions match those filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint" style={{ marginTop: '0.8rem' }}>
        {locale === 'km'
          ? 'ជួរដេកដែលដាក់សម្គាល់ = រង់ចាំលើស ១ ម៉ោង ដោយគ្មាន webhook។'
          : 'Highlighted rows have been pending for over an hour with no provider webhook — the reconciliation flag.'}
      </p>
    </div>
  )
}
