import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout, { PasswordField } from '../components/AuthLayout.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

const DEMO = [
  { label: 'Dara Sok', role: 'Customer', icon: 'user', id: 'dara@example.com' },
  { label: 'Chantha Meas', role: 'Organizer', icon: 'building', id: 'organizer@example.com' },
  { label: 'Platform Admin', role: 'Platform admin', icon: 'shield', id: 'admin@example.com' },
]

const ERRORS = {
  NO_SUCH_USER: { en: 'No account with that phone or email.', km: 'គ្មានគណនីជាមួយលេខ ឬអ៊ីមែលនេះទេ។' },
  BAD_CREDENTIALS: { en: 'Wrong password.', km: 'ពាក្យសម្ងាត់មិនត្រឹមត្រូវ។' },
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

  function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const result = login({ identifier, password })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true })
  }

  /** One tap to fill a demo account — the prototype has no real accounts. */
  function useDemo(id) {
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
          <button key={d.id} type="button" className="demo-row" onClick={() => useDemo(d.id)}>
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
        <Field label={t('phoneOrEmail')} hint="+85512345678 · dara@example.com">
          <span className="field-icon">
            <Icon name="user" size={16} />
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
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
