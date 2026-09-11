import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout, { PasswordField } from '../components/AuthLayout.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

// Phone numbers, not emails. The API identifies an account by phone_e164 -
// app_user.email is nullable, so it cannot be the login identifier - and these
// buttons used to fill in addresses that /auth/login has no way to look up.
//
// The numbers are the demo rows from V6__seed_demo_users.sql, whose password
// V19 finally made a real BCrypt hash of "password". Before that migration every
// one of these failed with "wrong password", because the seeded column held the
// literal string 'hashed-password'.
const DEMO = [
  { label: 'Dara Sok', role: 'Customer', icon: 'user', id: '+85512345678' },
  { label: 'Chantha Meas', role: 'Organizer', icon: 'building', id: '+85512987654' },
  { label: 'Sovann Chey', role: 'Organizer', icon: 'building', id: '+85511556677' },
  { label: 'Platform Admin', role: 'Platform admin', icon: 'shield', id: '+85510111222' },
]

const ERRORS = {
  // One message for an unknown number AND a wrong password. The API answers the
  // same 401 either way, on purpose: a difference between the two would let
  // anyone use this form to discover which phone numbers hold accounts.
  BAD_CREDENTIALS: {
    en: 'Incorrect phone number or password.',
    km: 'លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។',
  },
  NETWORK: {
    en: 'Could not reach the server. Check your connection and try again.',
    km: 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ។ សូមពិនិត្យការតភ្ជាប់ ហើយព្យាយាមម្តងទៀត។',
  },
  ACCOUNT_DISABLED: {
    en: 'This account has been disabled by the platform.',
    km: 'គណនីនេះត្រូវបានបិទដោយវេទិកា។',
  },
}

export default function LoginPage() {
  const { t, locale } = useLocale()
  useDocumentTitle(t('login'))
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const from = location.state?.from || '/'

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const result = await login({ identifier, password })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true })
  }

  /** One tap to fill a demo account — the prototype has no real accounts. */
  function fillFromDemo(id) {
    setIdentifier(id)
    setPassword('password')
    setError(null)
  }

  const demoPanel = (
    <div className="demo-note auth-demo">
      <b className="with-icon">
        <Icon name="info" size={14} />
        {t('demoAccounts')}
      </b>
      <span className="small">
        {locale === 'km'
          ? 'ចុចមួយណាមួយដើម្បីបំពេញ — ពាក្យសម្ងាត់គឺ'
          : 'Tap one to fill the form — the password is'}{' '}
        <span className="mono">password</span>
      </span>
      <div className="demo-list">
        {DEMO.map((d) => (
          <button key={d.id} type="button" className="demo-row" onClick={() => fillFromDemo(d.id)}>
            <Icon name={d.icon} size={15} />
            <span>
              <b>{d.label}</b>
              <em>{d.role}</em>
            </span>
            <Icon name="arrowRight" size={14} className="ml-auto" />
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <AuthLayout title={t('loginTitle')} subtitle={t('loginSub')} footer={demoPanel}>
      {location.state?.from && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone="info">{t('loginRequired')}</Alert>
        </div>
      )}

      <form className="stack" onSubmit={submit} noValidate>
        <Field label={t('phone')} hint="+85512345678">
          <span className="field-icon">
            <Icon name="user" size={16} />
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
            />
          </span>
        </Field>

        <Field label={t('password')}>
          <PasswordField value={password} onChange={setPassword} />
        </Field>

        {error && <Alert tone="danger">{ERRORS[error]?.[locale] || ERRORS[error]?.en || error}</Alert>}

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
          <Icon name="login" size={17} />
          {t('login')}
        </button>
      </form>

      <p className="auth-switch">
        {t('noAccount')} <Link to="/register">{t('register')}</Link>
      </p>
    </AuthLayout>
  )
}
