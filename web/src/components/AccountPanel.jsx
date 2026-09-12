import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { Alert, Field } from './ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { changePassword, updateProfile } from '../api/auth.js'

/** Must match the .is-closing animation in ACCT_CSS below. */
const CLOSE_MS = 180

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
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()

  /* Which screen the panel is showing. The forms were all stacked on one
     scroll before; as a menu they are two taps from anywhere and the panel
     opens on something readable rather than on three sets of inputs. */
  const [view, setView] = useState('menu')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

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
    setView('menu')
    setConfirmSignOut(false)

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
          {/* One slot on each side keeps the title optically centred whether or
              not a back button is present. */}
          <div className="acct-head-slot">
            {view !== 'menu' && (
              <button
                type="button"
                className="acct-close"
                onClick={() => setView('menu')}
                aria-label={km ? 'ត្រឡប់ក្រោយ' : 'Back'}
              >
                <Icon name="arrowLeft" size={18} />
              </button>
            )}
          </div>

          <h1>{TITLES[view](km)}</h1>

          <div className="acct-head-slot acct-head-slot-end">
            <button
              ref={closeRef}
              type="button"
              className="acct-close"
              onClick={beginClose}
              aria-label={km ? 'បិទ' : 'Close'}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="acct-body">
          {!user ? (
            <p className="muted small">{km ? 'កំពុងផ្ទុក…' : 'Loading…'}</p>
          ) : view === 'menu' ? (
            <AccountMenu
              user={user}
              km={km}
              t={t}
              onGo={setView}
              onSignOut={() => setConfirmSignOut(true)}
            />
          ) : view === 'details' ? (
            /*
             * Keyed on the SAVED values, so the form remounts - and its
             * useState initialisers re-run - whenever the server record
             * actually changes. That is the same job an effect full of
             * setState would do, without the cascading render.
             */
            <DetailsForm
              key={`${user.display_name}|${user.email}`}
              user={user}
              km={km}
              t={t}
              toast={toast}
              refreshUser={refreshUser}
            />
          ) : (
            <PasswordForm km={km} toast={toast} />
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmSignOut}
        title={km ? 'ចេញពីគណនី?' : 'Sign out?'}
        confirmLabel={km ? 'ចេញពីគណនី' : 'Sign out'}
        cancelLabel={km ? 'បោះបង់' : 'Cancel'}
        tone="danger"
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => {
          // Close first: signing out unmounts the chip this panel would
          // otherwise try to hand focus back to, and re-renders the shell
          // underneath. No exit animation on a session change.
          setConfirmSignOut(false)
          onClose()
          logout()
          navigate('/')
        }}
      >
        {km
          ? 'អ្នកនឹងត្រូវចូលប្រើម្តងទៀតនៅលើឧបករណ៍នេះ។'
          : "You'll need to sign in again on this device."}
      </ConfirmDialog>
    </div>,
    document.body,
  )
}

const TITLES = {
  menu: (km) => (km ? 'គណនីរបស់ខ្ញុំ' : 'My account'),
  details: (km) => (km ? 'ព័ត៌មានរបស់អ្នក' : 'Your details'),
  password: (km) => (km ? 'ពាក្យសម្ងាត់' : 'Password'),
}

/** One row of the settings list. Static rows show a value instead of a chevron. */
function Row({ icon, tone, title, sub, value, onClick }) {
  const body = (
    <>
      <span className={`acct-row-icon${tone ? ` tone-${tone}` : ''}`} aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <span className="acct-row-text">
        <span className="acct-row-title">{title}</span>
        {sub && <span className="acct-row-sub">{sub}</span>}
      </span>
      {value ? (
        <span className="acct-row-value">{value}</span>
      ) : onClick ? (
        <Icon name="chevronRight" size={16} className="acct-row-chev" />
      ) : null}
    </>
  )
  if (!onClick) return <div className="acct-row is-static">{body}</div>
  return (
    <button type="button" className="acct-row" onClick={onClick}>
      {body}
    </button>
  )
}

/**
 * The panel's home screen: who you are, then what you can change.
 *
 * <p>Phone and role are shown but not editable. The phone number is the login
 * identity and the token's subject - rendering it in a text input beside three
 * fields that do save is a promise the API does not keep.
 */
function AccountMenu({ user, km, t, onGo, onSignOut }) {
  const roleLabel = t(user.role) !== user.role ? t(user.role) : user.role

  return (
    <>
      <div className="acct-hero">
        <div className="acct-avatar" aria-hidden="true">
          {initials(user.display_name)}
        </div>
        <div className="acct-hero-text">
          <div className="acct-hero-name">{user.display_name}</div>
          {user.email && <div className="acct-hero-sub">{user.email}</div>}
          <span className="acct-role">
            <Icon name="shield" size={12} />
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Only when there is one. An empty "Organisation - none" row on every
          customer's account is noise about something they have not done. */}
      {user.organizer_profile_id && (
        <div className="acct-org">
          <span className="acct-org-mark" aria-hidden="true">
            <Icon name="building" size={18} />
          </span>
          <span className="acct-org-text">
            <span className="acct-org-name">{user.org_name_en}</span>
            {user.org_name_km && <span className="acct-org-alt km">{user.org_name_km}</span>}
          </span>
        </div>
      )}

      <section className="acct-section">
        <h2>{km ? 'គណនី' : 'Account'}</h2>
        <div className="acct-rows">
          <Row
            icon="user"
            tone="brand"
            title={km ? 'ព័ត៌មានផ្ទាល់ខ្លួន' : 'Personal details'}
            sub={km ? 'ឈ្មោះ និងអ៊ីមែល' : 'Name and email'}
            onClick={() => onGo('details')}
          />
          <Row
            icon="lock"
            tone="warning"
            title={km ? 'ពាក្យសម្ងាត់' : 'Password'}
            sub={km ? 'ប្តូរពាក្យសម្ងាត់របស់អ្នក' : 'Change your password'}
            onClick={() => onGo('password')}
          />
        </div>
      </section>

      <section className="acct-section">
        <h2>{km ? 'ការចូលប្រើប្រាស់' : 'Sign-in'}</h2>
        <div className="acct-rows">
          <Row
            icon="phone"
            tone="quiet"
            title={km ? 'លេខទូរស័ព្ទ' : 'Phone number'}
            sub={km ? 'លេខសម្រាប់ចូលប្រើ មិនអាចប្តូរបានទេ' : 'How you sign in. Cannot be changed here.'}
            value={<span className="mono">{user.phone_e164}</span>}
          />
        </div>
      </section>

      <div className="acct-signout">
        <button type="button" className="acct-btn acct-btn-signout" onClick={onSignOut}>
          <Icon name="logout" size={15} />
          {km ? 'ចេញពីគណនី' : 'Sign out'}
        </button>
      </div>
    </>
  )
}

/** Display name and email - the two fields a user owns. */
function DetailsForm({ user, km, t, toast, refreshUser }) {
  const [displayName, setDisplayName] = useState(user.display_name ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [busy, setBusy] = useState(false)
  const [emailError, setEmailError] = useState('')

  const dirty =
    displayName !== (user.display_name ?? '') || email !== (user.email ?? '')

  async function save(e) {
    e.preventDefault()
    if (!displayName.trim()) return
    setBusy(true)
    setEmailError('')
    try {
      await updateProfile({
        display_name: displayName.trim(),
        email: email.trim(),
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

/**
 * What stands in for the password form on an account that has no password.
 *
 * <p>Saying "you sign in with Google" is not decoration - it answers the
 * question the missing form would otherwise raise, and it tells someone who
 * cannot get in where to go. Their password is Google's problem, changed at
 * Google, and nothing here can help with it.
 */
function NoPasswordCard({ km, user }) {
  return (
    <section className="acct-card">
      <h2>{km ? 'របៀបដែលអ្នកចូលប្រើ' : 'How you sign in'}</h2>

      <div className="acct-signin">
        <span className="acct-signin-icon" aria-hidden="true">
          <Icon name="lock" size={18} />
        </span>
        <div>
          <div className="acct-signin-name">
            {km ? 'ចូលដោយ Google' : 'Google'}
          </div>
          {user.email && <div className="small muted">{user.email}</div>}
        </div>
      </div>

      <p className="muted small acct-note">
        {km
          ? 'គណនីនេះគ្មានពាក្យសម្ងាត់នៅលើ CamboBook ទេ ដូច្នេះគ្មានអ្វីត្រូវប្តូរនៅទីនេះឡើយ។ ដើម្បីប្តូរពាក្យសម្ងាត់ ឬពិនិត្យសុវត្ថិភាព សូមធ្វើនៅក្នុងគណនី Google របស់អ្នក។'
          : 'This account has no CamboBook password, so there is nothing to change here. Your password lives with Google — change it, or review which apps you have connected, in your Google account.'}
      </p>
    </section>
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
              width: min(30rem, 100%); height: 100%;
              background: var(--color-page); color: var(--color-ink);
              border-inline-start: 1px solid var(--color-line);
              box-shadow: -16px 0 40px rgb(0 0 0 / .18);
              display: flex; flex-direction: column;
              animation: acct-in .22s cubic-bezier(.32, .72, 0, 1) both; }
.acct-panel.is-closing { animation: acct-out .18s cubic-bezier(.32, .72, 0, 1) both; }

@media (max-width: 560px) { .acct-panel { width: 100%; } }

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
.acct-head { flex: none; display: grid; align-items: center; gap: var(--acct-3);
             grid-template-columns: 34px 1fr 34px;
             padding: var(--acct-4) var(--acct-4);
             border-bottom: 1px solid var(--color-line);
             background: var(--color-surface); }
.acct-head h1 { margin: 0; font-size: 1.05rem; font-weight: 600;
                letter-spacing: -.02em; text-align: center; }
.acct-head-slot { display: flex; }
.acct-head-slot-end { justify-content: flex-end; }

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
.acct-hero { display: flex; align-items: center; gap: var(--acct-4); }
.acct-avatar { flex: none; width: 56px; height: 56px; border-radius: 50%;
               display: grid; place-items: center;
               background: var(--color-tint-2); color: var(--color-on-tint);
               font-size: 1.15rem; font-weight: 600; letter-spacing: -.02em; }
.acct-hero-text { min-width: 0; display: flex; flex-direction: column;
                  align-items: flex-start; gap: 2px; }
.acct-hero-name { font-size: 1.15rem; font-weight: 600; letter-spacing: -.02em; }
.acct-hero-sub { font-size: .85rem; color: var(--color-muted);
                 overflow-wrap: anywhere; }
.acct-role { margin-top: var(--acct-1); display: inline-flex; align-items: center;
             gap: var(--acct-1); padding: 2px var(--acct-2);
             border-radius: 999px; background: var(--color-tint);
             color: var(--color-on-tint); font-size: .72rem; font-weight: 600; }

.acct-org { display: flex; align-items: center; gap: var(--acct-3);
            border: 1px solid var(--color-line);
            border-radius: var(--radius-card, 16px);
            background: var(--color-surface); padding: var(--acct-3) var(--acct-4); }
.acct-org-mark { flex: none; display: grid; place-items: center;
                 width: 38px; height: 38px; border-radius: var(--radius-ui, 12px);
                 background: var(--color-surface-2); color: var(--color-ink-2); }
.acct-org-text { min-width: 0; display: flex; flex-direction: column; }
.acct-org-name { font-size: .95rem; font-weight: 600; letter-spacing: -.01em; }
.acct-org-alt { font-size: .82rem; color: var(--color-muted); }

/* ------------------------------------------------------ settings rows */
.acct-section { display: flex; flex-direction: column; gap: var(--acct-2); }
.acct-section h2 { margin: 0; font-size: .72rem; font-weight: 600;
                   text-transform: uppercase; letter-spacing: .07em;
                   color: var(--color-muted); padding-inline-start: var(--acct-1); }

.acct-rows { border: 1px solid var(--color-line);
             border-radius: var(--radius-card, 16px);
             background: var(--color-surface); overflow: hidden; }
.acct-row { width: 100%; display: flex; align-items: center; gap: var(--acct-3);
            padding: var(--acct-3) var(--acct-4); text-align: start;
            font: inherit; color: inherit; background: none; border: 0;
            border-top: 1px solid var(--color-line-2); }
.acct-row:first-child { border-top: 0; }
button.acct-row { cursor: pointer; transition: background .12s; }
button.acct-row:hover { background: var(--color-surface-2); }
button.acct-row:focus-visible { outline: 2px solid var(--color-brand-500);
                                outline-offset: -2px; }

.acct-row-icon { flex: none; display: grid; place-items: center;
                 width: 34px; height: 34px; border-radius: var(--radius-ui, 12px);
                 background: var(--color-surface-2); color: var(--color-ink-2); }
.acct-row-icon.tone-brand { background: var(--color-tint-2); color: var(--color-on-tint); }
.acct-row-icon.tone-warning { background: var(--color-warning-soft); color: var(--color-warning); }
.acct-row-icon.tone-danger { background: var(--color-danger-soft); color: var(--color-danger); }
.acct-row-icon.tone-quiet { background: var(--color-quiet-soft); color: var(--color-quiet); }

.acct-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.acct-row-title { font-size: .92rem; font-weight: 600; letter-spacing: -.01em; }
.acct-row-sub { font-size: .78rem; color: var(--color-muted); line-height: 1.5; }
.acct-row-value { flex: none; font-size: .82rem; color: var(--color-muted); }
.acct-row-chev { flex: none; color: var(--color-muted); }

/* Signing out ends the session rather than configuring anything, so it is a
   button, not one more row in a settings list. The auto margin drops it to the
   foot of the panel on short accounts and simply follows the last section once
   the body is tall enough to scroll. */
.acct-signout { margin-top: auto; padding-top: var(--acct-2); }
.acct-btn-signout { width: 100%; background: var(--color-surface);
                    border-color: var(--color-line); color: var(--color-danger); }
.acct-btn-signout:hover { background: var(--color-danger-soft);
                          border-color: var(--color-danger); }

/* How you sign in, when there is no password to change. */
.acct-signin { display: flex; align-items: center; gap: var(--acct-3);
               padding: var(--acct-3); border-radius: var(--radius-ui, 12px);
               background: var(--color-surface-2); }
.acct-signin-icon { flex: none; width: 36px; height: 36px; border-radius: 50%;
                    display: grid; place-items: center;
                    background: var(--color-surface); color: var(--color-ink-2);
                    border: 1px solid var(--color-line); }
.acct-signin-name { font-size: .95rem; font-weight: 600; letter-spacing: -.01em; }

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
.acct-btn-primary { background: var(--color-brand-600); color: #fff; }
.acct-btn-primary:not(:disabled):hover { background: var(--color-brand-700); }

`
