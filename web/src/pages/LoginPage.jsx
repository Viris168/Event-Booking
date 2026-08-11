import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

const DEMO = [
  { label: 'Customer · Dara Sok', id: 'dara@example.com' },
  { label: 'Organizer · Chantha Meas', id: 'organizer@example.com' },
  { label: 'Platform admin', id: 'admin@example.com' },
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

  return (
    <div className="container container-narrow">
      <div className="panel">
        <div className="panel-body">
          <h1>{t('loginTitle')}</h1>
          <p className="muted">{t('loginSub')}</p>

          {location.state?.from && (
            <div style={{ marginTop: '1rem' }}>
              <Alert tone="info">{t('loginRequired')}</Alert>
            </div>
          )}

          <form className="stack" onSubmit={submit} style={{ marginTop: '1.2rem' }} noValidate>
            <Field label={t('phoneOrEmail')} hint="+85512345678 · dara@example.com">
              <input
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />
            </Field>
            <Field label={t('password')}>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>

            {error && (
              <Alert tone="danger">{ERRORS[error]?.[locale] || ERRORS[error]?.en || error}</Alert>
            )}

            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {t('login')}
            </button>
          </form>

          <p className="small muted text-center" style={{ marginTop: '1rem' }}>
            {t('noAccount')} <Link to="/register">{t('register')}</Link>
          </p>
        </div>
      </div>

      <div className="demo-note" style={{ marginTop: '1rem' }}>
        <b>{t('demoAccounts')}</b> — password <span className="mono">password</span>
        <div className="chips" style={{ marginTop: '0.5rem' }}>
          {DEMO.map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              onClick={() => {
                setIdentifier(d.id)
                setPassword('password')
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
