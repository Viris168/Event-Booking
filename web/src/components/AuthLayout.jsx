import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * Shared shell for /login and /register: one centred card, nothing else.
 *
 * <p>Still one column and still no marketing panel — signing in is a job
 * someone came here to finish, not a page to be sold on. What the card gained
 * is the one piece of context it was missing: whose site this is, on the screen
 * a stranger is asked to type a password into.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useLocale()

  // `container` is a utility, so it would outrank a component class trying to
  // narrow it — the column lives on an inner element instead.
  return (
    <div className="container">
      <div className="auth-wrap">
        <div className="panel">
          <div className="panel-body">
            {/* The mark doubles as the way out: someone who landed here by
                accident should not have to hunt for the exit. */}
            <Link to="/" className="auth-brand" aria-label={t('brand')}>
              <img src="/logo/CB-mark.png" alt="" width="280" height="320" />
              <span>{t('brand')}</span>
            </Link>

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
export function PasswordField({
  id,
  describedBy,
  value,
  onChange,
  autoComplete = 'current-password',
  invalid,
}) {
  const { t } = useLocale()
  const [shown, setShown] = useState(false)
  return (
    <span className="field-icon pw-field">
      <Icon name="lock" size={16} />
      <input
        id={id}
        className="input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
      />
      {/*
        The glyph changes with the state, which it did not before: the same eye
        was drawn whether the password was masked or not, so the only signal
        that the control had done anything was the text itself changing. A
        struck-through eye means "hidden", and pairs with the label rather than
        contradicting it.
      */}
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('hidePassword') : t('showPassword')}
        title={shown ? t('hidePassword') : t('showPassword')}
        aria-pressed={shown}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </span>
  )
}
