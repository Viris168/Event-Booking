import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/** Shared shell for /login and /register: one centred card, nothing else. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useLocale()

  // `container` is a utility, so it would outrank a component class trying to
  // narrow it — the column lives on an inner element instead.
  return (
    <div className="container">
      <div className="auth-wrap">
      <div className="panel">
        <div className="panel-body">
          <div className="auth-head">
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>

      {footer}

        <Link to="/" className="auth-back">
          <Icon name="arrowLeft" size={15} />
          {t('backHome')}
        </Link>
      </div>
    </div>
  )
}

/** Password input with a reveal toggle. */
export function PasswordField({ value, onChange, autoComplete = 'current-password', invalid }) {
  const { t } = useLocale()
  const [shown, setShown] = useState(false)
  return (
    <span className="field-icon pw-field">
      <Icon name="lock" size={16} />
      <input
        className="input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('hidePassword') : t('showPassword')}
        title={shown ? t('hidePassword') : t('showPassword')}
        aria-pressed={shown}
      >
        <Icon name="eye" size={16} />
      </button>
    </span>
  )
}
