import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { PasswordField } from '../components/AuthLayout.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import GoogleSignInButton from '../components/GoogleSignInButton.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { toE164 } from '../lib/format.js'

const ERRORS = {
  PHONE_TAKEN: { en: 'That phone number is already registered.', km: 'លេខទូរស័ព្ទនេះមានគណនីរួចហើយ។' },
  EMAIL_TAKEN: { en: 'That email is already registered.', km: 'អ៊ីមែលនេះមានគណនីរួចហើយ។' },
  // Google's own answer was fine and ours was not. Vague on purpose: the API
  // returns one code for a bad signature, a wrong audience and an expired
  // token alike, so detail here would be invented.
  GOOGLE_FAILED: {
    en: 'Could not complete that Google sign-in. Try again, or fill in the form.',
    km: 'មិនអាចបញ្ចប់ការចូលដោយ Google បានទេ។ សូមព្យាយាមម្តងទៀត ឬបំពេញទម្រង់។',
  },
}

export default function RegisterPage() {
  const { t, locale } = useLocale()
  useDocumentTitle(t('register'))
  const { register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    display_name: '',
    phone_e164: '',
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate() {
    const next = {}
    if (!form.display_name.trim())
      next.display_name = locale === 'km' ? 'ត្រូវការឈ្មោះ' : 'Display name is required'
    if (!toE164(form.phone_e164))
      next.phone_e164 =
        locale === 'km' ? 'ឧទាហរណ៍៖ 012 345 678' : 'For example 012 345 678'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = locale === 'km' ? 'អ៊ីមែលមិនត្រឹមត្រូវ' : 'Enter a valid email'
    if (form.password.length < 8) next.password = t('passwordHint')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setServerError(null)
    if (!validate()) {
      // Move focus to the first problem so the error is announced and reachable.
      requestAnimationFrame(() => {
        e.target.querySelector('[aria-invalid="true"]')?.focus()
      })
      return
    }
    setBusy(true)
    // `email: null` rather than '' - the API treats a blank string as a value
    // and would try to enforce UNIQUE on it, so two accounts without an email
    // would collide with each other.
    const result = await register({
      display_name: form.display_name.trim(),
      // validate() has already proved this converts; toE164 is what the
      // API's CHECK constraint accepts, not the 012... the user typed.
      phone_e164: toE164(form.phone_e164),
      email: form.email.trim() || null,
      password: form.password,
    })
    setBusy(false)
    if (result.error) {
      setServerError(result.error)
      return
    }
    toast(locale === 'km' ? 'សូមស្វាគមន៍!' : 'Account created — welcome!', 'success')
    navigate('/')
  }

  /*
   * Signing up with Google IS signing in - there is no separate "create
   * account" call, because the first verified token creates the row. So this is
   * the same handler the login screen uses, and it lands in the same place.
   */
  async function onGoogleToken(idToken) {
    if (busy) return
    setBusy(true)
    setServerError(null)
    const result = await loginWithGoogle(idToken)
    setBusy(false)
    if (result.error) {
      setServerError(result.error)
      return
    }
    toast(locale === 'km' ? 'សូមស្វាគមន៍!' : 'Account created — welcome!', 'success')
    navigate('/')
  }

  return (
    <AuthLayout
      title={t('registerTitle')}
      subtitle={
        locale === 'km'
          ? 'គណនីថ្មីទាំងអស់ចាប់ផ្តើមជាអតិថិជន។'
          : 'Every new account starts as a customer.'
      }
    >
      <form className="stack" onSubmit={submit} noValidate>
        <Field label={t('displayName')} error={errors.display_name}>
          <span className="field-icon">
            <Icon name="user" size={16} />
            <input
              className="input"
              value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              aria-invalid={!!errors.display_name}
              autoComplete="name"
            />
          </span>
        </Field>

        <Field
          label={t('phone')}
          error={errors.phone_e164}
          hint={locale === 'km' ? 'ឧ. 012 345 678' : 'e.g. 012 345 678'}
        >
          <span className="field-icon">
            <Icon name="phone" size={16} />
            <input
              className="input"
              value={form.phone_e164}
              onChange={(e) => set('phone_e164', e.target.value)}
              aria-invalid={!!errors.phone_e164}
              inputMode="tel"
              autoComplete="tel"
            />
          </span>
        </Field>

        <Field label={t('email')} optional error={errors.email}>
          <span className="field-icon">
            <Icon name="mail" size={16} />
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              aria-invalid={!!errors.email}
              autoComplete="email"
            />
          </span>
        </Field>

        <Field label={t('password')} error={errors.password} hint={t('passwordHint')}>
          <PasswordField
            value={form.password}
            onChange={(v) => set('password', v)}
            autoComplete="new-password"
            invalid={!!errors.password}
          />
        </Field>

        {serverError && (
          <Alert tone="danger">
            {ERRORS[serverError]?.[locale] || ERRORS[serverError]?.en || serverError}
          </Alert>
        )}

        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
          <Icon name="check" size={17} />
          {t('register')}
        </button>
      </form>

      <GoogleSignInButton disabled={busy} onToken={onGoogleToken} />

      <p className="auth-switch">
        {t('haveAccount')} <Link to="/login">{t('login')}</Link>
      </p>
    </AuthLayout>
  )
}
