import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout, { PasswordField } from '../components/AuthLayout.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { toE164 } from '../lib/format.js'
import GoogleSignInButton from '../components/GoogleSignInButton.jsx'
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
  // A Google sign-in that Google itself accepted but our server would not.
  // Deliberately vague: the API answers one code for a bad signature, a wrong
  // audience and an expired token alike, and inventing detail here would be
  // inventing it.
  GOOGLE_FAILED: {
    en: 'Could not complete that Google sign-in. Try again, or use your phone number.',
    km: 'មិនអាចបញ្ចប់ការចូលដោយ Google បានទេ។ សូមព្យាយាមម្តងទៀត ឬប្រើលេខទូរស័ព្ទរបស់អ្នក។',
  },
  EMAIL_TAKEN: {
    en: 'An account with that email already signs in with a password. Use the form above.',
    km: 'គណនីដែលមានអ៊ីមែលនេះចូលដោយពាក្យសម្ងាត់រួចហើយ។ សូមប្រើទម្រង់ខាងលើ។',
  },
  ACCOUNT_DISABLED: {
    en: 'This account has been disabled by the platform.',
    km: 'គណនីនេះត្រូវបានបិទដោយវេទិកា។',
  },
}

export default function LoginPage() {
  const { t, locale } = useLocale()
  useDocumentTitle(t('login'))
  const { login, loginWithGoogle } = useAuth()
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
    /*
     * Normalised so signing in accepts the same shapes registration did. Someone
     * who typed 012 345 678 to sign up will type it again here, and being told
     * "wrong password" because of a format difference is the worst possible
     * answer - it is indistinguishable from actually forgetting it.
     *
     * Falls back to the raw text when it cannot be read as a Cambodian number,
     * so the server still answers the single INVALID_CREDENTIALS it always did.
     */
    const result = await login({ identifier: toE164(identifier) ?? identifier, password })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true })
  }

  /*
   * Same destination as the password form. A Google account with no phone
   * number yet is still signed in - PhoneGate is what stops it at checkout,
   * rather than a redirect here that would interrupt someone who only wanted
   * to browse.
   */
  async function onGoogleToken(idToken) {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await loginWithGoogle(idToken)
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
        <Field label={t('phone')} hint="012 345 678">
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

      <GoogleSignInButton disabled={busy} onToken={onGoogleToken} />

      <p className="auth-switch">
        {t('noAccount')} <Link to="/register">{t('register')}</Link>
      </p>
    </AuthLayout>
  )
}
