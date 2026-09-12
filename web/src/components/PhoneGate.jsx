import { useState } from 'react'
import Icon from './Icon.jsx'
import { Alert, Field } from './ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { setPhone } from '../api/auth.js'
import { toE164 } from '../lib/format.js'

/*
 * The one thing a Google account arrives without.
 *
 * Sign-in through Google gives an email and a name and no phone number, and a
 * ticket in Cambodia is collected against a number: the gate calls it, the
 * organiser texts about a cancellation, PayWay confirms against it. So the
 * account is allowed to exist and browse without one, and is stopped here -
 * at the point where a missing number would actually cost someone something.
 *
 * Deliberately not a redirect on sign-in. Someone who signed in to look at what
 * is on this weekend should not be met with a form; someone about to pay
 * should.
 *
 * Wrap whatever needs a number:
 *
 *   <PhoneGate>
 *     <CheckoutForm />
 *   </PhoneGate>
 */
export default function PhoneGate({ children }) {
  const { user, refreshUser } = useAuth()
  const { locale } = useLocale()
  const km = locale === 'km'

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Not `!user`: a page behind ProtectedRoute has one. A user WITH a number
  // passes straight through, which is every password account ever created.
  if (user?.phone_e164) return children

  async function submit(e) {
    e.preventDefault()
    /*
     * Normalised here rather than trusted: the field accepts 012 345 678
     * because that is how the number is written in Cambodia, and the API's
     * CHECK constraint only knows E.164.
     */
    const phone = toE164(value)
    if (busy) return
    if (!phone) {
      setError(km ? 'ឧទាហរណ៍៖ 012 345 678' : 'For example 012 345 678')
      return
    }
    setBusy(true)
    setError('')
    try {
      await setPhone(phone)
      // The whole app reads phone_e164 off the auth context, so re-reading the
      // record is what actually opens the gate.
      await refreshUser()
    } catch (err) {
      const code = err?.response?.data?.errorCode
      setError(
        code === 'PHONE_ALREADY_REGISTERED'
          ? km
            ? 'លេខនេះមានគណនីរួចហើយ។'
            : 'That number already has an account.'
          : code === 'VALIDATION_ERROR'
            ? km
              ? 'សូមបញ្ចូលលេខកម្ពុជា ដូចជា +85512345678។'
              : 'Enter a Cambodian number, like +85512345678.'
            : km
              ? 'មិនអាចរក្សាទុកលេខបានទេ។'
              : 'Could not save that number.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pg-wrap">
      <form className="pg-card" onSubmit={submit}>
        <span className="pg-icon" aria-hidden="true">
          <Icon name="user" size={20} />
        </span>

        <h1>{km ? 'បន្ថែមលេខទូរស័ព្ទរបស់អ្នក' : 'Add your phone number'}</h1>
        <p className="muted small pg-lede">
          {km
            ? 'អ្នកបានចូលដោយ Google ដែលមិនផ្តល់លេខទូរស័ព្ទ។ សំបុត្ររបស់អ្នកភ្ជាប់ទៅលេខនេះ ហើយអ្នករៀបចំប្រើវាដើម្បីទាក់ទងអ្នក។'
            : 'You signed in with Google, which does not share a phone number. Your tickets are tied to it, and organisers use it to reach you.'}
        </p>

        {error && (
          <Alert tone="danger" title={km ? 'មិនបានសម្រេច' : "That didn't work"}>
            <span className="small">{error}</span>
          </Alert>
        )}

        <Field
          label={km ? 'លេខទូរស័ព្ទ' : 'Phone number'}
          hint={km ? 'ឧទាហរណ៍ 012 345 678' : 'For example 012 345 678'}
        >
          <input
            className="input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            autoComplete="tel"
            inputMode="tel"
            placeholder="012 345 678"
            autoFocus
          />
        </Field>

        <p className="pg-note small muted">
          {km
            ? 'លេខនេះនឹងក្លាយជាឈ្មោះចូលប្រើរបស់អ្នក ហើយមិនអាចប្តូរបានទេ។'
            : 'This becomes how you sign in, and it cannot be changed later.'}
        </p>

        <button className="pg-btn" type="submit" disabled={busy || !value.trim()}>
          {busy ? (km ? 'កំពុងរក្សាទុក…' : 'Saving…') : km ? 'បន្ត' : 'Continue'}
        </button>
      </form>

      <style>{`
        .pg-wrap { max-width: 520px; margin: 0 auto; padding: var(--spacing-page, 1.15rem); }
        .pg-card { border: 1px solid var(--color-line);
                   border-radius: var(--radius-card, 16px);
                   background: var(--color-surface); color: var(--color-ink);
                   padding: 2rem; display: flex; flex-direction: column; gap: 1rem; }
        .pg-icon { width: 44px; height: 44px; border-radius: 50%; display: grid;
                   place-items: center; background: var(--color-surface-2);
                   color: var(--color-ink-2); }
        .pg-card h1 { margin: 0; font-size: 1.25rem; letter-spacing: -.022em; }
        .pg-lede { margin: -.5rem 0 0; line-height: 1.6; }
        .pg-note { margin: -.25rem 0 0; line-height: 1.6; }
        .pg-btn { font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer;
                  padding: .75rem 1.5rem; border-radius: var(--radius-ui, 12px);
                  border: 1px solid transparent;
                  background: var(--color-ink); color: var(--color-surface); }
        .pg-btn:disabled { opacity: .5; cursor: not-allowed; }
        [data-theme='dark'] .pg-btn { background: var(--color-ink); color: var(--color-page); }
      `}</style>
    </div>
  )
}
