import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Field, Progress } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { usd } from '../../lib/format.js'
import {
  PROVINCES,
  getUserById,
  getVenue,
  inventorySummary,
  listEvents,
  provinceName,
  salesSummary,
  setEventStatus,
  useStore,
} from '../../mock/store.js'
import db from '../../mock/store.js'

const STATUSES = ['DRAFT', 'PUBLISHED', 'TAKEN_DOWN']

export default function AdminEventsPage() {
  useStore()
  const { t, locale, date } = useLocale()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [province, setProvince] = useState('')

  const events = listEvents({ q, status, province, sort: 'soonest' })

  function organizerName(organizerId) {
    const profile = db.organizerProfiles.find((p) => p.id === organizerId)
    if (!profile) return '—'
    const owner = getUserById(profile.user_id)
    return `${locale === 'km' ? profile.org_name_km : profile.org_name_en}${
      owner ? ` · ${owner.display_name}` : ''
    }`
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('moderation')}</h1>
          <p>
            {locale === 'km'
              ? 'ព្រឹត្តិការណ៍ទាំងអស់លើវេទិកា ដោយមិនគិតពីអ្នកចាត់ចែង។'
              : 'Every event on the platform, regardless of owner.'}
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1.2rem' }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={t('search')}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
            <Field label={t('status')}>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ALL">{locale === 'km' ? 'ទាំងអស់' : 'All statuses'}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('province')}>
              <select className="select" value={province} onChange={(e) => setProvince(e.target.value)}>
                <option value="">{t('allProvinces')}</option>
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {locale === 'km' ? p.name_km : p.name_en}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'km' ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                <th>{t('organizer')}</th>
                <th>{t('status')}</th>
                <th>{locale === 'km' ? 'កាលបរិច្ឆេទ' : 'Date'}</th>
                <th style={{ minWidth: 150 }}>{t('ticketsSold')}</th>
                <th className="num">{t('revenue')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const inv = inventorySummary(e.id)
                const venue = getVenue(e.venue_id)
                return (
                  <tr key={e.id} className={e.status === 'TAKEN_DOWN' ? 'flagged' : ''}>
                    <td>
                      <Link to={`/events/${e.id}`} className="strong">
                        {locale === 'km' ? e.title_km : e.title_en}
                      </Link>
                      <div className="small muted">
                        {locale === 'km' ? venue?.name_km : venue?.name_en} ·{' '}
                        {provinceName(venue?.province_code, locale)}
                      </div>
                    </td>
                    <td className="small">{organizerName(e.organizer_id)}</td>
                    <td>
                      <Badge status={e.status} />
                    </td>
                    <td className="small">{date(e.starts_at)}</td>
                    <td>
                      <div className="small muted">
                        {inv.sold} / {inv.capacity}
                      </div>
                      <Progress sold={inv.sold} held={inv.held} capacity={inv.capacity} />
                    </td>
                    <td className="num strong">{usd(salesSummary(e.id).revenue_usd_cents)}</td>
                    <td>
                      <div className="row row-tight">
                        <Link className="btn btn-sm btn-ghost" to={`/organizer/events/${e.id}/sales`}>
                          {t('sales')}
                        </Link>
                        {e.status === 'TAKEN_DOWN' ? (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setEventStatus(e.id, 'PUBLISHED')
                              toast(locale === 'km' ? 'បានផ្សាយវិញ' : 'Event restored', 'success')
                            }}
                          >
                            {locale === 'km' ? 'ផ្សាយវិញ' : 'Restore'}
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setEventStatus(e.id, 'TAKEN_DOWN')
                              toast(locale === 'km' ? 'បានដកចេញ' : 'Event taken down', 'info')
                            }}
                          >
                            {t('takeDown')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
