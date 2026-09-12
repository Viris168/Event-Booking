import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { PasswordField } from '../components/AuthLayout.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { isValidPhone } from '../lib/format.js'

const ERRORS = {
  PHONE_TAKEN: { en: 'That phone number is already registered.', km: 'លេខទូរស័ព្ទនេះមានគណនីរួចហើយ។' },
  EMAIL_TAKEN: { en: 'That email is already registered.', km: 'អ៊ីមែលនេះមានគណនីរួចហើយ។' },
}

export default function RegisterPage() {
  const { t, locale } = useLocale()
  useDocumentTitle(t('register'))
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    display_name: '',
    phone_e164: '+855',
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
    if (!isValidPhone(form.phone_e164))
      next.phone_e164 =
        locale === 'km' ? 'ទម្រង់៖ +855 និងលេខ ៨–៩ តួ' : 'Format: +855 followed by 8–9 digits'
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
      phone_e164: form.phone_e164.trim(),
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
          hint={locale === 'km' ? 'ឧ. +85512345678' : 'e.g. +85512345678'}
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

      <p className="auth-switch">
        {t('haveAccount')} <Link to="/login">{t('login')}</Link>
      </p>
    </AuthLayout>
  )
}
