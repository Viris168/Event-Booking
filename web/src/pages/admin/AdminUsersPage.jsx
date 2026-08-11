import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Field, Money, ResponsiveTable } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { listBookings, listUsers, setUserDisabled, useStore } from '../../mock/store.js'

const ROLES = ['CUSTOMER', 'ORGANIZER', 'PLATFORM_ADMIN']

export default function AdminUsersPage() {
  useStore()
  const { t, locale, date } = useLocale()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [disabled, setDisabled] = useState('')
  const [expanded, setExpanded] = useState(null)

  const users = listUsers({ q, role, disabled })

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
              <input
                className="input"
                value={q}
                placeholder={locale === 'km' ? 'ឈ្មោះ លេខទូរស័ព្ទ អ៊ីមែល' : 'Name, phone or email'}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">{locale === 'km' ? 'គ្រប់តួនាទី' : 'All roles'}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={locale === 'km' ? 'ស្ថានភាពគណនី' : 'Account state'}>
              <select className="select" value={disabled} onChange={(e) => setDisabled(e.target.value)}>
                <option value="">{locale === 'km' ? 'ទាំងអស់' : 'All'}</option>
                <option value="no">{locale === 'km' ? 'សកម្ម' : 'Active'}</option>
                <option value="yes">{locale === 'km' ? 'បានបិទ' : 'Disabled'}</option>
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="panel">
        <ResponsiveTable>
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'km' ? 'អ្នកប្រើ' : 'User'}</th>
                <th>Role</th>
                <th>{t('phone')}</th>
                <th>{t('email')}</th>
                <th>Locale</th>
                <th>{locale === 'km' ? 'ចុះឈ្មោះ' : 'Joined'}</th>
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
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                setUserDisabled(u.id, true)
                                toast(`${u.display_name} ${locale === 'km' ? 'បានបិទ' : 'disabled'}`, 'info')
                              }}
                            >
                              {t('disable')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === u.id && (
                      <tr>
                        <td colSpan="8" style={{ background: 'var(--surface-2)' }}>
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
    </div>
  )
}
