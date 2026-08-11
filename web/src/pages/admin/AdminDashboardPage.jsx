import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, Money, ResponsiveTable, Stat } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { timeAgo, usd } from '../../lib/format.js'
import { listPayments, platformStats, recentBookings, useStore } from '../../mock/store.js'

export default function AdminDashboardPage() {
  useStore()
  const { t, locale, dateTime } = useLocale()

  const stats = platformStats()
  const stuck = listPayments({ stuckOnly: true })
  const recent = recentBookings(8)

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
          sub={`${stats.published} published · ${stats.drafts} draft · ${stats.takenDown} taken down`}
        />
        <Stat
          icon="wallet"
          tone="green"
          label={locale === 'km' ? 'ចំណូលសរុប' : 'Gross collected'}
          value={usd(stats.grossUsdCents)}
          sub={<Money cents={stats.grossUsdCents} />}
        />
        <Stat
          icon="ticket"
          label={locale === 'km' ? 'សំបុត្រ' : 'Tickets'}
          value={stats.ticketsIssued}
          sub={`${stats.checkedIn} ${locale === 'km' ? 'បានស្កេន' : 'checked in'}`}
        />
        <Stat
          icon="clock"
          label={t('reconciliation')}
          value={stats.awaitingConfirmation}
          sub={locale === 'km' ? 'ការកក់រង់ចាំការបញ្ជាក់' : 'bookings awaiting confirmation'}
          alert={stats.awaitingConfirmation > 0}
        />
        <Stat
          icon="alert"
          label={t('stuckPayments')}
          value={stats.stuckPayments}
          sub={locale === 'km' ? 'លើស ១ ម៉ោង' : 'pending over 1 hour'}
          alert={stats.stuckPayments > 0}
        />
        <Stat
          icon="refresh"
          label={t('requestRefund')}
          value={stats.refundRequests}
          sub={locale === 'km' ? 'រង់ចាំការសម្រេច' : 'awaiting a decision'}
          alert={stats.refundRequests > 0}
        />
      </div>

      {stuck.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <Alert
            tone="warn"
            title={`${stuck.length} ${t('stuckPayments').toLowerCase()}`}
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
                    <td className="small">{locale === 'km' ? b.event?.title_km : b.event?.title_en}</td>
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
            <Link className="btn btn-outline btn-block" to="/organizer">
              <Icon name="ticket" size={16} />
              {t('organizerDashboard')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
