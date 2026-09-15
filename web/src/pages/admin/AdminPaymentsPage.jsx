import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useState, useEffect } from 'react'
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
import { timeAgo, usd } from '../../lib/format.js'
import { getPayments } from '../../api/admin.js'

const PROVIDERS = ['BAKONG_KHQR', 'ABA_PAYWAY']
const STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED']

export default function AdminPaymentsPage() {
  const { t, locale, dateTime } = useLocale()
  useDocumentTitle(t('payments'))
  const [params] = useSearchParams()

  const [provider, setProvider] = useState('')
  const [status, setStatus] = useState('')
  const [stuckOnly, setStuckOnly] = useState(params.get('stuck') === '1')

  /*
   * Payment attempts, from payment_transaction via /admin/payments.
   *
   * Filtering is the server's: "stuck" in particular is a comparison against
   * the clock, and a tab left open overnight would answer it from whenever it
   * last rendered. Provider and status go the same way so the three controls
   * behave alike.
   */
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [paymentsError, setPaymentsError] = useState(false)
  const [paymentsVersion, setPaymentsVersion] = useState(0)

  useEffect(() => {
    let live = true
    getPayments({
      ...(provider ? { provider } : {}),
      ...(status ? { status } : {}),
      ...(stuckOnly ? { stuckOnly: true } : {}),
    })
      .then((res) => {
        if (!live) return
        setPaymentsError(false)
        setPayments(Array.isArray(res) ? res : [])
      })
      .catch(() => {
        if (!live) return
        setPaymentsError(true)
        setPayments([])
      })
      .finally(() => live && setLoadingPayments(false))
    return () => {
      live = false
    }
  }, [provider, status, stuckOnly, paymentsVersion])

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

      {paymentsError && (
        <Alert tone="danger" style={{ marginBottom: '1.2rem' }}>
          {km ? 'មិនអាចផ្ទុកការទូទាត់បានទេ។' : 'Could not load payments.'}{' '}
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setLoadingPayments(true)
              setPaymentsVersion((v) => v + 1)
            }}
          >
            {km ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
          </button>
        </Alert>
      )}

      {loadingPayments ? (
        <p className="muted small">{km ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
      ) : payments.length === 0 && !paymentsError ? (
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
                      {p.booking_ref}
                    </Link>
                    <div className="small muted">
                      {locale === 'km' ? p.event_title_km : p.event_title_en}
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
