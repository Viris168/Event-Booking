import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import {
  ActiveFilters,
  Badge,
  Empty,
  Field,
  IconSelect,
  Money,
  ResponsiveTable,
  SearchInput,
} from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { listBookings, listUsers, setUserDisabled, useStore } from '../../mock/store.js'

const ROLES = ['CUSTOMER', 'ORGANIZER', 'PLATFORM_ADMIN']

export default function AdminUsersPage() {
  useStore()
  const { t, locale, date } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(t('users'))
  const toast = useToast()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [disabled, setDisabled] = useState('')
  const [expanded, setExpanded] = useState(null)
  // Holds the user awaiting a disable confirmation. Disabling locks someone out
  // of an account they may be mid-booking on, so it asks first; re-enabling is
  // harmless and stays one click.
  const [confirming, setConfirming] = useState(null)

  const users = listUsers({ q, role, disabled })

  const stateLabel = (v) => (v === 'yes' ? (km ? 'បានបិទ' : 'Disabled') : km ? 'សកម្ម' : 'Active')
  const chips = [
    q && { key: 'q', icon: 'search', label: q, onRemove: () => setQ('') },
    role && { key: 'role', icon: 'shield', label: role, onRemove: () => setRole('') },
    disabled && {
      key: 'disabled',
      icon: 'user',
      label: stateLabel(disabled),
      onRemove: () => setDisabled(''),
    },
  ].filter(Boolean)

  function clearAll() {
    setQ('')
    setRole('')
    setDisabled('')
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t('users')}</h1>
          <p>
            {users.length}{' '}
            {locale === 'km' ? 'អ្នកប្រើប្រាស់ត្រូវនឹងតម្រង' : 'users match the current filters'}
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
                placeholder={km ? 'ឈ្មោះ លេខទូរស័ព្ទ អ៊ីមែល' : 'Name, phone or email'}
                ariaLabel={t('searchLabel')}
                clearLabel={t('reset')}
              />
            </Field>
            <Field label={km ? 'តួនាទី' : 'Role'}>
              <IconSelect
                icon="shield"
                value={role}
                onChange={setRole}
                ariaLabel={km ? 'តួនាទី' : 'Role'}
              >
                <option value="">{km ? 'គ្រប់តួនាទី' : 'All roles'}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={km ? 'ស្ថានភាពគណនី' : 'Account state'}>
              <IconSelect
                icon="user"
                value={disabled}
                onChange={setDisabled}
                ariaLabel={km ? 'ស្ថានភាពគណនី' : 'Account state'}
              >
                <option value="">{km ? 'ទាំងអស់' : 'All'}</option>
                <option value="no">{km ? 'សកម្ម' : 'Active'}</option>
                <option value="yes">{km ? 'បានបិទ' : 'Disabled'}</option>
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

      {users.length === 0 ? (
        <Empty icon="search" title={km ? 'រកមិនឃើញអ្នកប្រើទេ' : 'No users match'}>
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
                <th>{km ? 'អ្នកប្រើ' : 'User'}</th>
                <th>{km ? 'តួនាទី' : 'Role'}</th>
                <th>{t('phone')}</th>
                <th>{t('email')}</th>
                <th>{km ? 'ភាសា' : 'Locale'}</th>
                <th>{km ? 'ចុះឈ្មោះ' : 'Joined'}</th>
                <th>{t('status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const bookings = listBookings({ userId: u.id })
                const spend = bookings
                  .filter((b) => ['CONFIRMED', 'REFUND_REQUESTED'].includes(b.state))
                  .reduce((a, b) => a + b.total_usd_cents, 0)
                return (
                  <Fragment key={u.id}>
                    <tr className={u.is_disabled ? 'flagged' : ''}>
                      <td>
                        <div className="font-bold">{u.display_name}</div>
                        <div className="small muted">#{u.id}</div>
                      </td>
                      <td>
                        <span className="badge badge-mode">{u.role}</span>
                      </td>
                      <td className="mono small">{u.phone_e164}</td>
                      <td className="small">{u.email || '—'}</td>
                      <td className="small">{u.locale.toUpperCase()}</td>
                      <td className="small muted">{date(u.created_at)}</td>
                      <td>
                        {u.is_disabled ? (
                          <span className="badge s-CANCELLED">
                            {locale === 'km' ? 'បានបិទ' : 'Disabled'}
                          </span>
                        ) : (
                          <span className="badge s-CONFIRMED">{locale === 'km' ? 'សកម្ម' : 'Active'}</span>
                        )}
                      </td>
                      <td>
                        <div className="row row-tight">
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                          >
                            {bookings.length} {locale === 'km' ? 'ការកក់' : 'bookings'}
                          </button>
                          {u.is_disabled ? (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => {
                                setUserDisabled(u.id, false)
                                toast(`${u.display_name} ${locale === 'km' ? 'បានបើក' : 'enabled'}`, 'success')
                              }}
                            >
                              {t('enable')}
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-danger" onClick={() => setConfirming(u)}>
                              {t('disable')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === u.id && (
                      <tr>
                        <td colSpan="8" className="bg-surface-2">
                          <div className="spread" style={{ marginBottom: '0.5rem' }}>
                            <span className="tiny">
                              {locale === 'km' ? 'ប្រវត្តិការកក់' : 'Booking history'}
                            </span>
                            <span className="small">
                              {locale === 'km' ? 'ចំណាយសរុប' : 'Lifetime spend'}:{' '}
                              <Money cents={spend} />
                            </span>
                          </div>
                          {bookings.length ? (
                            <div className="stack-sm">
                              {bookings.map((b) => (
                                <div className="spread small" key={b.id}>
                                  <Link className="mono" to={`/bookings/${b.id}`}>
                                    {b.booking_ref}
                                  </Link>
                                  <Badge status={b.state} />
                                  <span className="muted">{date(b.created_at)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="muted small">—</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
        title={km ? 'បិទគណនីនេះ?' : 'Disable this account?'}
        confirmLabel={t('disable')}
        onConfirm={() => {
          setUserDisabled(confirming.id, true)
          toast(`${confirming.display_name} ${km ? 'បានបិទ' : 'disabled'}`, 'info')
          setConfirming(null)
        }}
        onClose={() => setConfirming(null)}
      >
        <p className="small muted">
          {km
            ? `${confirming?.display_name} នឹងមិនអាចចូលគណនីបានទេ។ ការកក់ដែលមានស្រាប់មិនត្រូវបានលុបចោលទេ ហើយអ្នកអាចបើកវិញនៅពេលណាក៏បាន។`
            : `${confirming?.display_name} will not be able to log in. Existing bookings are left untouched, and you can re-enable the account at any time.`}
        </p>
      </ConfirmDialog>
    </div>
  )
}
