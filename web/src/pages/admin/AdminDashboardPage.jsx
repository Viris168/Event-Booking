import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, Money, ResponsiveTable, Stat } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { timeAgo, usd } from '../../lib/format.js'
import { getPlatformStats, getRecentBookings } from '../../api/admin.js'

/*
 * Platform overview, from the database.
 *
 * The counters used to be derived in the browser by walking mock/store.js's
 * arrays. Two requests replace that: one aggregate for the tiles and one small
 * page of bookings for the strip. The stuck-payment count comes from the
 * aggregate rather than by fetching the payments and measuring the array -
 * whether an attempt is stuck is a question about elapsed time, and the server
 * is the one holding a clock anybody has looked at recently.
 */
const EMPTY_STATS = {
  users: 0, customers: 0, organizers: 0, disabled: 0,
  events: 0, published: 0, drafts: 0, pending_review: 0, taken_down: 0,
  bookings: 0, confirmed: 0, awaiting_confirmation: 0, refund_requests: 0,
  gross_usd_cents: 0, tickets_issued: 0, checked_in: 0,
  stuck_payments: 0, pending_applications: 0,
}

export default function AdminDashboardPage() {
  const { t, locale, dateTime } = useLocale()
  useDocumentTitle(t('adminDashboard'))

  const [stats, setStats] = useState(EMPTY_STATS)
  const [recent, setRecent] = useState([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([getPlatformStats(), getRecentBookings(8)])
      .then(([s, r]) => {
        if (!live) return
        setLoadError(false)
        setStats(s ?? EMPTY_STATS)
        setRecent(Array.isArray(r) ? r : [])
      })
      .catch(() => {
        if (!live) return
        setLoadError(true)
        setStats(EMPTY_STATS)
        setRecent([])
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('adminDashboard')}</h1>
          <p>
            {locale === 'km'
              ? 'ទិដ្ឋភាពទូទៅនៃវេទិកា — អ្នកប្រើ ព្រឹត្តិការណ៍ ការទូទាត់។'
              : 'Platform-wide view of users, events and money movement.'}
          </p>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" style={{ marginBottom: '1.2rem' }}>
          {locale === 'km'
            ? 'មិនអាចផ្ទុកទិន្នន័យវេទិកាបានទេ។'
            : 'Could not load platform data. The figures below are not live.'}
        </Alert>
      )}

      <div className="stats" style={{ marginBottom: '1.2rem' }}>
        <Stat
          icon="users"
          label={t('users')}
          value={stats.users}
          sub={`${stats.customers} customers · ${stats.organizers} organizers${
            stats.disabled ? ` · ${stats.disabled} disabled` : ''
          }`}
        />
        <Stat
          icon="calendar"
          label={t('events')}
          value={stats.events}
          sub={`${stats.published} published · ${stats.drafts} draft · ${stats.taken_down} taken down`}
        />
        <Stat
          icon="wallet"
          tone="green"
          label={locale === 'km' ? 'ចំណូលសរុប' : 'Gross collected'}
          value={usd(stats.gross_usd_cents)}
          sub={<Money cents={stats.gross_usd_cents} />}
        />
        <Stat
          icon="ticket"
          label={locale === 'km' ? 'សំបុត្រ' : 'Tickets'}
          value={stats.tickets_issued}
          sub={`${stats.checked_in} ${locale === 'km' ? 'បានស្កេន' : 'checked in'}`}
        />
        <Stat
          icon="clock"
          label={t('reconciliation')}
          value={stats.awaiting_confirmation}
          sub={locale === 'km' ? 'ការកក់រង់ចាំការបញ្ជាក់' : 'bookings awaiting confirmation'}
          alert={stats.awaiting_confirmation > 0}
        />
        <Stat
          icon="alert"
          label={t('stuckPayments')}
          value={stats.stuck_payments}
          sub={locale === 'km' ? 'លើស ១ ម៉ោង' : 'pending over 1 hour'}
          alert={stats.stuck_payments > 0}
        />
        <Stat
          icon="refresh"
          label={t('requestRefund')}
          value={stats.refund_requests}
          sub={locale === 'km' ? 'រង់ចាំការសម្រេច' : 'awaiting a decision'}
          alert={stats.refund_requests > 0}
        />
      </div>

      {stats.stuck_payments > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <Alert
            tone="warn"
            title={`${stats.stuck_payments} ${t('stuckPayments').toLowerCase()}`}
            actions={
              <Link className="btn btn-sm btn-outline" to="/admin/payments?stuck=1">
                {t('payments')}
                <Icon name="arrowRight" size={14} />
              </Link>
            }
          >
            {locale === 'km'
              ? 'ការទូទាត់ទាំងនេះមិនបានទទួល webhook ទេ។ ត្រូវផ្ទៀងផ្ទាត់ដោយដៃ។'
              : 'These attempts never received a provider webhook and need manual reconciliation.'}
          </Alert>
        </div>
      )}

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h2>{locale === 'km' ? 'ការកក់ថ្មីៗ' : 'Recent bookings'}</h2>
            <Link className="small with-icon" to="/admin/payments">
              {t('payments')}
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <ResponsiveTable>
            <table className="table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>{locale === 'km' ? 'អ្នកទិញ' : 'Buyer'}</th>
                  <th>{locale === 'km' ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                  <th>{t('status')}</th>
                  <th className="num">{t('total')}</th>
                  <th>{locale === 'km' ? 'ពេលវេលា' : 'Created'}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link className="mono small" to={`/bookings/${b.id}`}>
                        {b.booking_ref}
                      </Link>
                    </td>
                    <td>
                      <div className="small font-bold">{b.buyer_name}</div>
                      <div className="small muted mono">{b.buyer_phone_e164}</div>
                    </td>
                    <td className="small">{locale === 'km' ? b.event_title_km : b.event_title_en}</td>
                    <td>
                      <Badge status={b.state} />
                    </td>
                    <td className="num font-bold">{usd(b.total_usd_cents)}</td>
                    <td className="small muted" title={dateTime(b.created_at)}>
                      {timeAgo(b.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
</ResponsiveTable>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{locale === 'km' ? 'តំណរហ័ស' : 'Jump to'}</h3>
          </div>
          <div className="panel-body stack-sm">
            <Link className="btn btn-outline btn-block" to="/admin/users">
              <Icon name="users" size={16} />
              {t('users')}
            </Link>
            <Link className="btn btn-outline btn-block" to="/admin/events">
              <Icon name="calendar" size={16} />
              {t('moderation')}
            </Link>
            <Link className="btn btn-outline btn-block" to="/admin/payments">
              <Icon name="card" size={16} />
              {t('payments')}
            </Link>
            <Link className="btn btn-outline btn-block" to="/admin/applications">
              <Icon name="ticket" size={16} />
              {t('organizerApplications')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
