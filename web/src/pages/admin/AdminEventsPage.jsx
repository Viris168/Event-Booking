import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import {
  ActiveFilters,
  Badge,
  Empty,
  Field,
  IconSelect,
  Progress,
  ResponsiveTable,
  SearchInput,
} from '../../components/ui.jsx'
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

// Declaration order is lifecycle order, so the filter dropdown reads as the
// path an event actually takes rather than as an alphabetical list.
const STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'TAKEN_DOWN',
]

export default function AdminEventsPage() {
  useStore()
  const { t, locale, date } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(t('moderation'))
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [province, setProvince] = useState('')
  // Event awaiting a take-down confirmation. Taking an event down pulls a live
  // listing off sale, so it asks first; restoring is safe and stays one click.
  const [confirming, setConfirming] = useState(null)

  const events = listEvents({ q, status, province, sort: 'soonest' }).content

  const chips = [
    q && { key: 'q', icon: 'search', label: q, onRemove: () => setQ('') },
    status !== 'ALL' && {
      key: 'status',
      icon: 'filter',
      label: status,
      onRemove: () => setStatus('ALL'),
    },
    province && {
      key: 'province',
      icon: 'mapPin',
      label: provinceName(province, locale),
      onRemove: () => setProvince(''),
    },
  ].filter(Boolean)

  function clearAll() {
    setQ('')
    setStatus('ALL')
    setProvince('')
  }

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
            {events.length}{' '}
            {km
              ? 'ព្រឹត្តិការណ៍ត្រូវនឹងតម្រង — គ្រប់ម្ចាស់ទាំងអស់។'
              : 'events match the current filters, across every owner.'}
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1.2rem' }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={t('searchLabel')}>
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder={km ? 'ចំណងជើង ឬទីកន្លែង' : 'Title or venue'}
                ariaLabel={t('searchLabel')}
                clearLabel={t('reset')}
              />
            </Field>
            <Field label={t('status')}>
              <IconSelect icon="filter" value={status} onChange={setStatus} ariaLabel={t('status')}>
                <option value="ALL">{km ? 'ទាំងអស់' : 'All statuses'}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={t('province')}>
              <IconSelect
                icon="mapPin"
                value={province}
                onChange={setProvince}
                ariaLabel={t('province')}
              >
                <option value="">{t('allProvinces')}</option>
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {km ? p.name_km : p.name_en}
                  </option>
                ))}
              </IconSelect>
            </Field>
          </div>

          {chips.length > 0 && (
            <div style={{ marginTop: '0.85rem' }}>
              <ActiveFilters items={chips} onClearAll={clearAll} clearAllLabel={t('reset')} />
            </div>
          )}
        </div>
      </div>

      {events.length === 0 ? (
        <Empty icon="search" title={km ? 'រកមិនឃើញព្រឹត្តិការណ៍ទេ' : 'No events match'}>
          {km
            ? 'សាកល្បងលុបតម្រងចេញ ឬស្វែងរកពាក្យផ្សេង។'
            : 'Try clearing a filter or searching for something else.'}
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
                <th>{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
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
                      <Link to={`/events/${e.id}`} className="font-bold">
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
                    <td className="num font-bold">{usd(salesSummary(e.id).revenue_usd_cents)}</td>
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
                          <button className="btn btn-sm btn-danger" onClick={() => setConfirming(e)}>
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
</ResponsiveTable>
      </div>
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        tone="danger"
        title={km ? 'ដកព្រឹត្តិការណ៍នេះចេញ?' : 'Take this event down?'}
        confirmLabel={t('takeDown')}
        onConfirm={() => {
          setEventStatus(confirming.id, 'TAKEN_DOWN')
          toast(km ? 'បានដកចេញ' : 'Event taken down', 'info')
          setConfirming(null)
        }}
        onClose={() => setConfirming(null)}
      >
        <p className="small muted">
          {km
            ? `«${confirming?.title_km}» នឹងបាត់ពីការស្វែងរក ហើយឈប់លក់សំបុត្រភ្លាម។ សំបុត្រដែលបានលក់រួចនៅតែមានសុពលភាព ហើយអ្នកអាចផ្សាយវិញបាន។`
            : `“${confirming?.title_en}” disappears from search and stops selling immediately. Tickets already sold stay valid, and you can restore it afterwards.`}
        </p>
      </ConfirmDialog>
    </div>
  )
}
