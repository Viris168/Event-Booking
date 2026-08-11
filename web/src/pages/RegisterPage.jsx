import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  const { t, locale, setLocale } = useLocale()
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    display_name: '',
    phone_e164: '+855',
    email: '',
    password: '',
    locale: locale,
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
    if (form.password.length < 8)
      next.password = locale === 'km' ? 'ត្រូវការ ៨ តួអក្សរជាអប្បបរមា' : 'At least 8 characters'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submit(e) {
    e.preventDefault()
    if (busy) return
    setServerError(null)
    if (!validate()) return
    setBusy(true)
    const result = register({
      display_name: form.display_name.trim(),
      phone_e164: form.phone_e164.trim(),
      email: form.email.trim() || null,
      password: form.password,
      locale: form.locale,
    })
    setBusy(false)
    if (result.error) {
      setServerError(result.error)
      return
    }
    setLocale(form.locale)
    toast(locale === 'km' ? 'សូមស្វាគមន៍!' : 'Account created — welcome!', 'success')
    navigate('/')
  }

  return (
    <div className="container container-narrow">
      <div className="panel">
        <div className="panel-body">
          <h1>{t('registerTitle')}</h1>
          <p className="muted">
            {locale === 'km'
              ? 'គណនីថ្មីទាំងអស់ចាប់ផ្តើមជាអតិថិជន។'
              : 'Every new account starts as a customer.'}
          </p>

          <form className="stack" onSubmit={submit} style={{ marginTop: '1.2rem' }} noValidate>
            <Field label={t('displayName')} error={errors.display_name}>
              <input
                className="input"
                value={form.display_name}
                onChange={(e) => set('display_name', e.target.value)}
                aria-invalid={!!errors.display_name}
                autoComplete="name"
              />
            </Field>

            <Field
              label={t('phone')}
              error={errors.phone_e164}
              hint={locale === 'km' ? 'ឧ. +85512345678' : 'e.g. +85512345678'}
            >
              <input
                className="input"
                value={form.phone_e164}
                onChange={(e) => set('phone_e164', e.target.value)}
                aria-invalid={!!errors.phone_e164}
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>

            <Field label={t('email')} optional error={errors.email}>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                aria-invalid={!!errors.email}
                autoComplete="email"
              />
            </Field>

            <Field label={t('password')} error={errors.password}>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                aria-invalid={!!errors.password}
                autoComplete="new-password"
              />
            </Field>

            <Field label={t('preferredLanguage')}>
              <div className="radio-cards" style={{ gridTemplateColumns: '1fr 1fr', display: 'grid' }}>
                <label className={`radio-card ${form.locale === 'km' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="locale"
                    checked={form.locale === 'km'}
                    onChange={() => set('locale', 'km')}
                  />
                  <span>
                    <span className="rc-title km">ភាសាខ្មែរ</span>
                    <span className="rc-sub">Khmer</span>
                  </span>
                </label>
                <label className={`radio-card ${form.locale === 'en' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="locale"
                    checked={form.locale === 'en'}
                    onChange={() => set('locale', 'en')}
                  />
                  <span>
                    <span className="rc-title">English</span>
                    <span className="rc-sub">អង់គ្លេស</span>
                  </span>
                </label>
              </div>
            </Field>

            {serverError && (
              <Alert tone="danger">{ERRORS[serverError]?.[locale] || ERRORS[serverError]?.en || serverError}</Alert>
            )}

            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {t('register')}
            </button>
          </form>

          <p className="small muted text-center" style={{ marginTop: '1rem' }}>
            {t('haveAccount')} <Link to="/login">{t('login')}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
