import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useCallback, useEffect, useState } from 'react'
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
import { Alert } from '../../components/ui.jsx'
import { getEventsOverview, takeDownEvent } from '../../api/admin.js'
import { useProvinces } from '../../lib/useProvinces.js'

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

/*
 * The moderation table, from the database.
 *
 * Every number here used to come from mock/store.js, so the sold/capacity bars
 * and the revenue column described a fixture file rather than the platform -
 * and "take down" flipped a field in a tab while the event carried on selling.
 * Both halves now go through /admin/events.
 */
export default function AdminEventsPage() {
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

  // provinceName comes from the hook rather than being written again here: it
  // already falls back to the raw code for a province the list does not know,
  // which is what makes a data problem visible instead of blank.
  const { provinces, provinceName } = useProvinces()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [version, setVersion] = useState(0)
  const [busyId, setBusyId] = useState(null)

  // Debounced, because typing in the search box re-queries and the answers
  // would otherwise race - "jaz" can land after "jazz".
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      getEventsOverview({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(status !== 'ALL' ? { status } : {}),
        ...(province ? { province } : {}),
      })
        .then((res) => {
          if (!live) return
          setLoadError(false)
          setEvents(Array.isArray(res) ? res : [])
        })
        .catch(() => {
          if (!live) return
          setLoadError(true)
          setEvents([])
        })
        .finally(() => live && setLoading(false))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q, status, province, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  async function takeDown(event) {
    setBusyId(event.id)
    try {
      await takeDownEvent(event.id)
      toast(km ? 'បានដកចេញ' : 'Event taken down', 'info')
      refresh()
    } catch (e) {
      toast(errorText(e, km ? 'មិនបានសម្រេច' : 'Could not take this event down'), 'error')
    } finally {
      setBusyId(null)
    }
  }

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

  // The server sends the organisation and its owner separately so the column
  // can be localised here rather than in SQL.
  function organizerName(e) {
    const org = km ? e.organizer_name_km : e.organizer_name_en
    if (!org) return '—'
    return e.organizer_owner_name ? `${org} · ${e.organizer_owner_name}` : org
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('moderation')}</h1>
          <p>
            {loading
              ? km
                ? 'កំពុងផ្ទុក…'
                : 'Loading…'
              : `${events.length} ${
                  km
                    ? 'ព្រឹត្តិការណ៍ត្រូវនឹងតម្រង — គ្រប់ម្ចាស់ទាំងអស់។'
                    : 'events match the current filters, across every owner.'
                }`}
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
                {provinces.map((p) => (
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

      {loadError && (
        <Alert tone="danger" style={{ marginBottom: '1.2rem' }}>
          {km ? 'មិនអាចផ្ទុកព្រឹត្តិការណ៍បានទេ។' : 'Could not load events.'}{' '}
          <button className="btn btn-sm btn-outline" onClick={refresh}>
            {km ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
          </button>
        </Alert>
      )}

      {loading ? (
        <p className="muted small">{km ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
      ) : events.length === 0 && !loadError ? (
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
              {events.map((e) => (
                <tr key={e.id} className={e.status === 'TAKEN_DOWN' ? 'flagged' : ''}>
                  <td>
                    <Link to={`/events/${e.id}`} className="font-bold">
                      {km ? e.title_km : e.title_en}
                    </Link>
                    <div className="small muted">
                      {km ? e.venue_name_km : e.venue_name_en} · {provinceName(e.province_code, locale)}
                    </div>
                  </td>
                  <td className="small">{organizerName(e)}</td>
                  <td>
                    <Badge status={e.status} />
                  </td>
                  <td className="small">{date(e.starts_at)}</td>
                  <td>
                    <div className="small muted">
                      {e.sold} / {e.capacity}
                    </div>
                    <Progress sold={e.sold} held={e.held} capacity={e.capacity} />
                  </td>
                  <td className="num font-bold">{usd(e.revenue_usd_cents)}</td>
                  <td>
                    <div className="row row-tight">
                      <Link className="btn btn-sm btn-ghost" to={`/organizer/events/${e.id}/sales`}>
                        {t('sales')}
                      </Link>
                      {/*
                        * Take-down is legal only from PUBLISHED, and TAKEN_DOWN
                        * is terminal - EventStateMachine gives it no outgoing
                        * edges. The prototype offered a "Restore" button here
                        * that put the event back to PUBLISHED; there is no such
                        * transition, so it is gone rather than left to fail.
                        */}
                      {e.status === 'PUBLISHED' && (
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busyId === e.id}
                          onClick={() => setConfirming(e)}
                        >
                          {t('takeDown')}
                        </button>
                      )}
                      {e.status === 'TAKEN_DOWN' && (
                        <span className="small muted">{km ? 'ដកចេញហើយ' : 'Taken down'}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
          takeDown(confirming)
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

function errorText(e, fallback) {
  const detail = e?.response?.data?.detail || e?.response?.data?.message
  return detail ? `${fallback}: ${detail}` : fallback
}
