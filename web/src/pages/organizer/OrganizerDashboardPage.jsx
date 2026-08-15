import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Badge, Empty, Progress, ResponsiveTable, Stat } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import {
  getVenue,
  inventorySummary,
  listEvents,
  salesSummary,
  setEventStatus,
  useStore,
} from '../../mock/store.js'

export default function OrganizerDashboardPage() {
  useStore()
  const { t, locale, date } = useLocale()
  useDocumentTitle(t('organizerDashboard'))
  const { organizerProfile } = useAuth()
  const orgId = organizerProfile?.id || null

  const events = listEvents({ status: 'ALL', organizerId: orgId, sort: 'soonest' })
  const totals = events.reduce(
    (acc, e) => {
      const s = salesSummary(e.id)
      return {
        revenue: acc.revenue + s.revenue_usd_cents,
        sold: acc.sold + s.sold,
        capacity: acc.capacity + s.capacity,
        checkedIn: acc.checkedIn + s.checkedIn,
      }
    },
    { revenue: 0, sold: 0, capacity: 0, checkedIn: 0 },
  )

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('organizerDashboard')}</h1>
          <p>
            {organizerProfile
              ? locale === 'km'
                ? organizerProfile.org_name_km
                : organizerProfile.org_name_en
              : locale === 'km'
                ? 'ព្រឹត្តិការណ៍ទាំងអស់'
                : 'All organizers'}
          </p>
        </div>
        <Link className="btn btn-primary" to="/organizer/events/new">
          <Icon name="plus" size={16} />
          {t('createEvent')}
        </Link>
      </div>

      <div className="stats" style={{ marginBottom: '1.4rem' }}>
        <Stat icon="wallet" tone="green" label={t('revenue')} value={usd(totals.revenue)} sub={locale === 'km' ? 'លក់រួច' : 'confirmed sales'} />
        <Stat
          icon="ticket"
          label={t('ticketsSold')}
          value={totals.sold.toLocaleString()}
          sub={`${t('capacity')} ${totals.capacity.toLocaleString()}`}
        />
        <Stat
          icon="calendar"
          label={t('myEvents')}
          value={events.length}
          sub={`${events.filter((e) => e.status === 'PUBLISHED').length} ${
            locale === 'km' ? 'កំពុងផ្សាយ' : 'live'
          }`}
        />
        <Stat icon="scan" label={t('checkIn')} value={totals.checkedIn.toLocaleString()} sub={locale === 'km' ? 'បានស្កេន' : 'scanned at door'} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{t('myEvents')}</h2>
        </div>
        {events.length ? (
          <ResponsiveTable>
            <table className="table">
              <thead>
                <tr>
                  <th>{locale === 'km' ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                  <th>{t('status')}</th>
                  <th>Mode</th>
                  <th>{locale === 'km' ? 'កាលបរិច្ឆេទ' : 'Date'}</th>
                  <th style={{ minWidth: 160 }}>{t('ticketsSold')}</th>
                  <th className="num">{t('revenue')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const inv = inventorySummary(e.id)
                  const sales = salesSummary(e.id)
                  const venue = getVenue(e.venue_id)
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link to={`/events/${e.id}`} className="font-bold">
                          {locale === 'km' ? e.title_km : e.title_en}
                        </Link>
                        <div className="small muted">{locale === 'km' ? venue?.name_km : venue?.name_en}</div>
                      </td>
                      <td>
                        <Badge status={e.status} />
                      </td>
                      <td>
                        <span className="badge badge-mode">{e.inventory_mode}</span>
                      </td>
                      <td className="small">{date(e.starts_at)}</td>
                      <td>
                        <div className="small font-bold">
                          {inv.sold} / {inv.capacity}
                          {inv.held ? <span className="muted"> · {inv.held} held</span> : null}
                        </div>
                        <Progress sold={inv.sold} held={inv.held} capacity={inv.capacity} />
                      </td>
                      <td className="num font-bold">{usd(sales.revenue_usd_cents)}</td>
                      <td>
                        <div className="row row-tight">
                          <Link className="btn btn-sm btn-outline" to={`/organizer/events/${e.id}/edit`}>
                            {t('editEvent')}
                          </Link>
                          <Link className="btn btn-sm btn-ghost" to={`/organizer/events/${e.id}/sales`}>
                            {t('sales')}
                          </Link>
                          {e.status === 'PUBLISHED' ? (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => setEventStatus(e.id, 'TAKEN_DOWN')}
                            >
                              {t('unpublish')}
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => setEventStatus(e.id, 'PUBLISHED')}
                            >
                              {t('publish')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
</ResponsiveTable>
        ) : (
          <Empty icon="calendar" title={locale === 'km' ? 'គ្មានព្រឹត្តិការណ៍' : 'No events yet'}>
            <Link className="btn btn-sm btn-primary" to="/organizer/events/new">
              {t('createEvent')}
            </Link>
          </Empty>
        )}
      </div>
    </div>
  )
}
