import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout, { PasswordField } from '../components/AuthLayout.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

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
  // The API says how many minutes in `details.retry_after_seconds`; this copy
  // deliberately does not, because AuthContext reduces a failure to its code
  // and a number that drifts out of date as the window rolls is worse than no
  // number at all.
  TOO_MANY_LOGIN_ATTEMPTS: {
    en: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    km: 'ការព្យាយាមចូលច្រើនពេក។ សូមរង់ចាំពីរបីនាទី ហើយព្យាយាមម្តងទៀត។',
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

  return (
    <AuthLayout title={t('loginTitle')} subtitle={t('loginSub')}>
      {location.state?.from && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone="info">{t('loginRequired')}</Alert>
        </div>
      )}

      <form className="stack" onSubmit={submit} noValidate>
        <Field label={t('phone')} hint="+85512000000">
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
