import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { Alert, Badge, Field } from './ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { changePassword, updateProfile } from '../api/auth.js'

/** Must match the .is-closing animation in ACCT_CSS below. */
const CLOSE_MS = 180

const LOCALES = [
  { value: 'EN', labelEn: 'English', labelKm: 'អង់គ្លេស' },
  { value: 'KM', labelEn: 'Khmer', labelKm: 'ខ្មែរ' },
]

/*
 * Your own account, as a panel over whatever you were doing.
 *
 * Not a page. Editing your display name is a thirty-second errand, and sending
 * someone to a full screen for it throws away the context they were in - the
 * event they were reading, the queue they were working - and makes them
 * navigate back to it afterwards. A panel returns them to exactly where they
 * stood, because they never left.
 *
 * Same reasoning as ConfirmDialog, and the same machinery: portalled to body so
 * no ancestor's overflow or stacking context can clip it, Escape and backdrop
 * both close, and the page behind is locked from scrolling while it is open.
 * Focus moves in on open and returns to the chip that opened it on close, which
 * ConfirmDialog does not do and should.
 */

export default function AccountPanel({ open, onClose }) {
  const { t, locale } = useLocale()
  const km = locale === 'km'
  const toast = useToast()
  const { user, refreshUser } = useAuth()

  const closeRef = useRef(null)
  const openerRef = useRef(null)

  /*
   * Exit animation needs the panel to outlive `open`, so closing is its own
   * state: the class changes, the CSS runs, and a timer unmounts. Going
   * straight from open to gone reads as the panel vanishing rather than
   * sliding away, which is the sort of thing that feels broken without anyone
   * being able to say why.
   *
   * A timer rather than onAnimationEnd. That event is the obvious choice and it
   * does not survive contact with this component: the panel is portalled out of
   * the React root, an animation that is interrupted or never starts fires
   * nothing at all, and prefers-reduced-motion shortens it to a hair. Any one
   * of those leaves the panel wedged half-closed with no way back. The timer
   * fires whatever the CSS does.
   */
  const [closing, setClosing] = useState(false)
  const timerRef = useRef(null)

  const beginClose = useCallback(() => {
    if (timerRef.current) return // already on the way out
    setClosing(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setClosing(false)
      onClose()
      // Restore focus after the panel is gone, or the browser moves it back to
      // an element that is about to be unmounted.
      const opener = openerRef.current
      if (opener && document.contains(opener)) opener.focus()
    }, CLOSE_MS)
  }, [onClose])

  // A panel unmounted mid-close (a route change, a sign-out) must not leave a
  // timer to fire onClose against a component that is gone.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!open) return undefined
    // Remember who opened us so focus can go back there. Without this, closing
    // dumps focus on <body> and a keyboard user restarts from the top of the page.
    openerRef.current = document.activeElement
    setClosing(false)

    const onKey = (e) => {
      if (e.key === 'Escape') beginClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, beginClose])

  if (!open) return null

  return createPortal(
    <div
      className={`acct-overlay${closing ? ' is-closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) beginClose()
      }}
    >
      <aside
        className={`acct-panel${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={km ? 'គណនីរបស់ខ្ញុំ' : 'My account'}
      >
        <style>{ACCT_CSS}</style>

        <header className="acct-head">
          <div>
            <h1>{km ? 'គណនីរបស់ខ្ញុំ' : 'My account'}</h1>
            <p className="muted small">
              {km
                ? 'ព័ត៌មានរបស់អ្នក និងរបៀបដែលអ្នកចូលប្រើប្រាស់។'
                : 'Your details, and how you sign in.'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="acct-close"
            onClick={beginClose}
            aria-label={km ? 'បិទ' : 'Close'}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="acct-body">
          {!user ? (
            <p className="muted small">{km ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
          ) : (
            <>
              <IdentityCard user={user} km={km} t={t} />
              {/*
                * Keyed on the SAVED values, so the form remounts - and its
                * useState initialisers re-run - whenever the server record
                * actually changes. That is the same job an effect full of
                * setState would do, without the cascading render.
                */}
              <DetailsForm
                key={`${user.display_name}|${user.email}|${user.locale}`}
                user={user}
                km={km}
                t={t}
                toast={toast}
                refreshUser={refreshUser}
              />
              <PasswordForm km={km} toast={toast} />
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

/**
 * The facts about this account that only the platform can change.
 *
 * <p>Separated from the editable form so the page never implies otherwise. A
 * phone number rendered in a text input next to three that save is a promise
 * the API does not keep - it is the login identity and the token's subject, and
 * changing it would hand someone an account they can no longer sign in to.
 */
function IdentityCard({ user, km, t }) {
  return (
    <div className="acct-id">
      <div className="acct-avatar" aria-hidden="true">
        {initials(user.display_name)}
      </div>
      <div className="acct-side-name">{user.display_name}</div>
      <Badge status={user.role} />

      <dl className="acct-facts">
        <div>
          <dt>{km ? 'លេខទូរស័ព្ទ' : 'Phone'}</dt>
          <dd className="mono">{user.phone_e164}</dd>
        </div>
        <div>
          <dt>{km ? 'តួនាទី' : 'Role'}</dt>
          <dd>{t(user.role) !== user.role ? t(user.role) : user.role}</dd>
        </div>
      </dl>

      <p className="acct-note small">
        {km
          ? 'លេខទូរស័ព្ទ និងតួនាទី មិនអាចប្តូរដោយខ្លួនឯងបានទេ។ លេខទូរស័ព្ទគឺជាឈ្មោះចូលប្រើរបស់អ្នក។'
          : 'Phone and role cannot be changed here. Your phone number is how you sign in.'}
      </p>

      {/* Only when there is one. An empty "Organisation — none" row on every
          customer's page is noise about something they have not done. */}
      {user.organizer_profile_id && (
        <div className="acct-org">
          <h2>{km ? 'អង្គភាព' : 'Organisation'}</h2>
          <div className="acct-org-name">{user.org_name_en}</div>
          {user.org_name_km && <div className="km small muted">{user.org_name_km}</div>}
        </div>
      )}
    </div>
  )
}

/** Display name, email and language - the three fields a user owns. */
function DetailsForm({ user, km, t, toast, refreshUser }) {
  const [displayName, setDisplayName] = useState(user.display_name ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [userLocale, setUserLocale] = useState(user.locale ?? 'KM')
  const [busy, setBusy] = useState(false)
  const [emailError, setEmailError] = useState('')

  const dirty =
    displayName !== (user.display_name ?? '') ||
    email !== (user.email ?? '') ||
    userLocale !== (user.locale ?? 'KM')

  async function save(e) {
    e.preventDefault()
    if (!displayName.trim()) return
    setBusy(true)
    setEmailError('')
    try {
      await updateProfile({
        display_name: displayName.trim(),
        email: email.trim(),
        locale: userLocale,
      })
      // The navbar renders the display name, so the context has to re-read or
      // the change is invisible until the next reload.
      await refreshUser()
      toast(km ? 'បានរក្សាទុក' : 'Saved', 'success')
    } catch (err) {
      const code = err?.response?.data?.errorCode
      if (code === 'EMAIL_ALREADY_REGISTERED') {
        setEmailError(km ? 'អ៊ីមែលនេះមានគណនីរួចហើយ។' : 'That email already has an account.')
      } else {
        toast(km ? 'រក្សាទុកមិនបានសម្រេច' : 'Could not save', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="acct-card" onSubmit={save}>
      <h2>{km ? 'ព័ត៌មានរបស់អ្នក' : 'Your details'}</h2>

      <Field label={t('displayName')}>
        <input
          className="input"
          value={displayName}
          maxLength={120}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </Field>

      <Field
        label="Email"
        optional
        error={emailError}
        hint={
          emailError
            ? undefined
            : km
              ? 'ប្រើសម្រាប់បង្កាន់ដៃ។ ការចូលប្រើនៅតែប្រើលេខទូរស័ព្ទ។'
              : 'Used for receipts. You still sign in with your phone number.'
        }
      >
        <input
          className="input"
          type="email"
          value={email}
          maxLength={255}
          onChange={(e) => {
            setEmail(e.target.value)
            setEmailError('')
          }}
        />
      </Field>

      <Field label={t('preferredLanguage')}>
        <select
          className="input acct-select"
          value={userLocale}
          onChange={(e) => setUserLocale(e.target.value)}
        >
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>
              {km ? l.labelKm : l.labelEn}
            </option>
          ))}
        </select>
      </Field>

      <div className="acct-actions">
        {/* Disabled until something actually changed: a Save that is always
            live invites the click that does nothing and teaches people the
            button is decorative. */}
        <button className="acct-btn acct-btn-primary" disabled={busy || !dirty}>
          {busy ? (km ? 'កំពុងរក្សាទុក…' : 'Saving…') : km ? 'រក្សាទុក' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

/**
 * Changing the password, which is also a session change.
 *
 * <p>The API revokes every refresh token and returns a fresh pair, which
 * api/auth.js stores. So this browser stays signed in and every other device
 * drops out within the access token's 15 minutes - that is the point of the
 * feature, and the form says so before it is submitted rather than after.
 */
function PasswordForm({ km, toast }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Checked here as well as on the server: the confirmation field never
  // crosses the wire, so a mismatch is only ever a client-side question.
  const mismatch = confirm.length > 0 && next !== confirm
  const tooShort = next.length > 0 && next.length < 8
  const ready = current && next.length >= 8 && next === confirm

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await changePassword({ current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      setConfirm('')
      toast(
        km ? 'បានប្តូរពាក្យសម្ងាត់។ ឧបករណ៍ផ្សេងត្រូវបានចេញ។' : 'Password changed. Other devices signed out.',
        'success',
      )
    } catch (err) {
      const code = err?.response?.data?.errorCode
      setError(
        code === 'INVALID_CREDENTIALS'
          ? km
            ? 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ។'
            : 'That is not your current password.'
          : km
            ? 'ប្តូរមិនបានសម្រេច។'
            : 'Could not change your password.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="acct-card" onSubmit={submit}>
      <h2>{km ? 'ពាក្យសម្ងាត់' : 'Password'}</h2>
      <p className="muted small acct-lede">
        {km
          ? 'ការប្តូរពាក្យសម្ងាត់នឹងធ្វើឱ្យឧបករណ៍ផ្សេងទៀតទាំងអស់ចេញពីគណនី។ កម្មវិធីរុករកនេះនៅតែចូលដដែល។'
          : 'Changing it signs out every other device. This browser stays signed in.'}
      </p>

      {error && (
        <Alert tone="danger" title={km ? 'មិនបានសម្រេច' : "That didn't work"}>
          <span className="small">{error}</span>
        </Alert>
      )}

      <Field label={km ? 'ពាក្យសម្ងាត់បច្ចុប្បន្ន' : 'Current password'}>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value)
            setError('')
          }}
        />
      </Field>

      <Field
        label={km ? 'ពាក្យសម្ងាត់ថ្មី' : 'New password'}
        error={tooShort ? (km ? 'យ៉ាងតិច ៨ តួអក្សរ។' : 'At least 8 characters.') : ''}
        hint={tooShort ? undefined : km ? 'យ៉ាងតិច ៨ តួអក្សរ។' : 'At least 8 characters.'}
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>

      <Field
        label={km ? 'បញ្ជាក់ពាក្យសម្ងាត់ថ្មី' : 'Confirm new password'}
        error={mismatch ? (km ? 'មិនដូចគ្នាទេ។' : 'These do not match.') : ''}
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <div className="acct-actions">
        <button className="acct-btn acct-btn-primary" disabled={busy || !ready}>
          <Icon name="lock" size={14} />
          {busy
            ? km
              ? 'កំពុងប្តូរ…'
              : 'Changing…'
            : km
              ? 'ប្តូរពាក្យសម្ងាត់'
              : 'Change password'}
        </button>
      </div>
    </form>
  )
}

/** First letters of the first two words, which is all an avatar needs. */
function initials(name) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/*
 * Scoped to this page and acct- prefixed, the same choice the admin queues made:
 * styles/index.css is edited on another branch, and one screen's layout is not
 * a shared primitive. Colours and radii come from the app's own custom
 * properties, so light and dark follow the theme without a second palette.
 *
 * One 4px spacing scale, as in queueStyles.js.
 */
const ACCT_CSS = `
/*
 * A panel over the page, not a page.
 *
 * 40% of the viewport, pinned to the right edge and full height. Below 860px
 * that would be a 340px column of form fields, so it takes the whole screen
 * there instead - the proportion is the point on a desktop, not on a phone.
 *
 * One 4px spacing scale, as in queueStyles.js.
 */
.acct-overlay { position: fixed; inset: 0; z-index: 60;
                background: rgb(0 0 0 / .45);
                display: flex; justify-content: flex-end;
                animation: acct-fade .18s ease-out both; }
.acct-overlay.is-closing { animation: acct-fade .16s ease-in both reverse; }

.acct-panel { --acct-1: .25rem; --acct-2: .5rem; --acct-3: .75rem; --acct-4: 1rem;
              --acct-5: 1.5rem; --acct-6: 2rem;
              width: 40%; height: 100%;
              background: var(--color-page); color: var(--color-ink);
              border-inline-start: 1px solid var(--color-line);
              box-shadow: -16px 0 40px rgb(0 0 0 / .18);
              display: flex; flex-direction: column;
              animation: acct-in .22s cubic-bezier(.32, .72, 0, 1) both; }
.acct-panel.is-closing { animation: acct-out .18s cubic-bezier(.32, .72, 0, 1) both; }

@media (max-width: 860px) { .acct-panel { width: 100%; } }

@keyframes acct-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes acct-in  { from { transform: translateX(100%) } to { transform: none } }
@keyframes acct-out { from { transform: none } to { transform: translateX(100%) } }

/* A slide is orientation, not decoration - but someone who asks for less
   motion should still get the panel, just without the travel. */
@media (prefers-reduced-motion: reduce) {
  .acct-overlay, .acct-overlay.is-closing,
  .acct-panel, .acct-panel.is-closing { animation-duration: .01ms; }
}

/* Header stays put; only the content scrolls. The close button must never be
   the thing you have to scroll back up to find. */
.acct-head { flex: none; display: flex; align-items: flex-start; gap: var(--acct-4);
             justify-content: space-between;
             padding: var(--acct-5) var(--acct-5) var(--acct-4);
             border-bottom: 1px solid var(--color-line);
             background: var(--color-surface); }
.acct-head h1 { margin: 0; font-size: 1.25rem; letter-spacing: -.022em; }
.acct-head p { margin: var(--acct-1) 0 0; color: var(--color-muted); }

.acct-close { flex: none; display: grid; place-items: center;
              width: 34px; height: 34px; border-radius: 50%;
              border: 1px solid transparent; background: transparent;
              color: var(--color-ink-2); cursor: pointer;
              transition: background .12s, border-color .12s; }
.acct-close:hover { background: var(--color-surface-2);
                    border-color: var(--color-line); }
.acct-close:focus-visible { outline: 2px solid var(--color-brand-500);
                            outline-offset: 2px; }

.acct-body { flex: 1; min-height: 0; overflow-y: auto;
             padding: var(--acct-5);
             display: flex; flex-direction: column; gap: var(--acct-5); }

/* ----------------------------------------------------------- identity */
/* A row, not a sidebar. In a 40% column the avatar belongs beside the name,
   and the two unchangeable facts read as a pair underneath. */
.acct-id { border: 1px solid var(--color-line);
           border-radius: var(--radius-card, 16px);
           background: var(--color-surface); padding: var(--acct-4);
           display: grid; grid-template-columns: auto 1fr; gap: var(--acct-3);
           align-items: center; }
.acct-avatar { grid-row: span 2; width: 48px; height: 48px; border-radius: 50%;
               display: grid; place-items: center;
               background: var(--color-surface-2); color: var(--color-ink-2);
               font-size: 1.05rem; font-weight: 600; letter-spacing: -.02em; }
.acct-side-name { font-size: 1.05rem; font-weight: 600; letter-spacing: -.015em;
                  align-self: end; }
/* The badge is a grid child, and a grid child stretches to its column by
   default - so the role pill spanned the whole panel. It should hug its text. */
.acct-id > .badge { justify-self: start; align-self: start; }

.acct-facts { grid-column: 1 / -1; margin: 0; display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: var(--acct-3); padding-top: var(--acct-3);
              border-top: 1px solid var(--color-line-2); }
.acct-facts > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.acct-facts dt { font-size: .78rem; color: var(--color-muted); }
.acct-facts dd { margin: 0; font-size: .9rem; overflow-wrap: anywhere; }

.acct-note { grid-column: 1 / -1; color: var(--color-muted); margin: 0;
             line-height: 1.6; }

.acct-org { grid-column: 1 / -1; padding-top: var(--acct-3);
            border-top: 1px solid var(--color-line-2); }
.acct-org h2 { margin: 0 0 var(--acct-1); font-size: .78rem; font-weight: 500;
               color: var(--color-muted); }
.acct-org-name { font-size: .95rem; font-weight: 600; letter-spacing: -.01em; }

/* --------------------------------------------------------------- forms */
.acct-card { border: 1px solid var(--color-line);
             border-radius: var(--radius-card, 16px);
             background: var(--color-surface);
             padding: var(--acct-5); display: flex; flex-direction: column;
             gap: var(--acct-4); }
.acct-card h2 { margin: 0; font-size: 1.05rem; font-weight: 600;
                letter-spacing: -.015em; }
.acct-lede { margin: calc(var(--acct-3) * -1) 0 0; }

.acct-actions { display: flex; justify-content: flex-end;
                padding-top: var(--acct-2);
                border-top: 1px solid var(--color-line-2); }

.acct-btn { display: inline-flex; align-items: center; justify-content: center;
            gap: var(--acct-2); font: inherit; font-size: .875rem; font-weight: 600;
            padding: var(--acct-3) var(--acct-5); border-radius: var(--radius-ui, 12px);
            border: 1px solid transparent; cursor: pointer;
            transition: background .12s, border-color .12s; }
.acct-btn:disabled { opacity: .5; cursor: not-allowed; }
.acct-btn-primary { background: var(--color-ink); color: var(--color-surface); }
.acct-btn-primary:not(:disabled):hover { background: var(--color-brand-800); }
[data-theme='dark'] .acct-btn-primary { background: var(--color-ink);
                                        color: var(--color-page); }
[data-theme='dark'] .acct-btn-primary:not(:disabled):hover {
  background: var(--color-brand-100); }

/* The native popup is an OS widget: color-scheme is what makes it readable in
   dark mode, not any rule aimed at the option elements. Same fix as the review
   queue's filter. */
.acct-select { color-scheme: light; }
[data-theme='dark'] .acct-select { color-scheme: dark; }
`
