import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import {
  applyToBeOrganizer,
  getMyOrganizerApplications,
  latestApplication,
} from '../api/organizerApplications.js'

/**
 * The chips under "What do you organize?". Free text on the server
 * (organizer_application.event_types is never queried), so the UI is free to
 * offer the friendlier control and join the selections on the way out.
 */
const EVENT_TYPES = ['Concert', 'Festival', 'Conference', 'Sports', 'Workshop', 'Exhibition', 'Other']

const MESSAGE_MAX = 2000

const EMPTY_FORM = {
  org_name_en: '',
  org_name_km: '',
  telegram_handle: '',
  facebook_url: '',
  message: '',
}

/**
 * Errors this page can actually provoke, and what they mean to the applicant.
 *
 * Both 409s are reachable by double-submitting from a stale page - the second
 * tab of someone who left this open. They are not bugs to hide; they mean the
 * page's idea of their state is out of date, which is why the handler refetches
 * rather than only showing the message.
 */
function messageFor(error) {
  const code = error?.response?.data?.errorCode
  if (code === 'ALREADY_AN_ORGANIZER') return 'You are already an organizer.'
  if (code === 'ORGANIZER_APPLICATION_ALREADY_PENDING') return 'You already have an application waiting for review.'
  if (code === 'VALIDATION_ERROR') return 'Please check the highlighted fields and try again.'
  if (!error?.response) return 'Could not reach the server. Check your connection and try again.'
  return 'Something went wrong. Please try again.'
}

/**
 * Apply to become an organiser, and see where a previous application got to.
 *
 * <p>Deliberately NOT under /organizer. That subtree is guarded by
 * roles={['ORGANIZER']}, and the entire audience for this page is people who
 * are not organisers yet - putting it there would make it reachable only by the
 * people who do not need it.
 *
 * <p>One route, four states, chosen by the newest application:
 *
 *     none      -> the form
 *     PENDING   -> "under review"
 *     REJECTED  -> the reason, and a way to apply again
 *     APPROVED  -> refresh the session and send them to /organizer
 */
export default function BecomeOrganizerPage() {
  useDocumentTitle('Become an organizer')

  const navigate = useNavigate()
  const { role, refreshUser } = useAuth()

  const [loading, setLoading] = useState(true)
  const [application, setApplication] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [types, setTypes] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Set by "Apply again": a REJECTED applicant is allowed a new attempt, and
  // uq_organizer_application_pending is partial precisely so they can.
  const [reapplying, setReapplying] = useState(false)

  /**
   * Approval does not change the JWT the browser is holding - role travels as a
   * claim, so the session still says CUSTOMER until /auth/me is read again.
   * Refetching before navigating is what stops ProtectedRoute from bouncing a
   * freshly approved organiser straight back here.
   */
  const goToOrganizer = useCallback(async () => {
    await refreshUser()
    navigate('/organizer', { replace: true })
  }, [refreshUser, navigate])

  const load = useCallback(async () => {
    try {
      const latest = latestApplication(await getMyOrganizerApplications())
      if (latest?.status === 'APPROVED') {
        await goToOrganizer()
        return
      }
      setApplication(latest)
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setLoading(false)
    }
  }, [goToOrganizer])

  useEffect(() => {
    // Someone who is already an organiser has nothing to apply for. Checked
    // before the fetch so the redirect does not wait on a request whose answer
    // cannot change it.
    if (role === 'ORGANIZER') {
      navigate('/organizer', { replace: true })
      return
    }
    load()
  }, [role, navigate, load])

  const set = (name) => (e) => {
    setForm((f) => ({ ...f, [name]: e.target.value }))
    setFieldErrors((f) => ({ ...f, [name]: undefined }))
  }

  const toggleType = (type) =>
    setTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]))

  /**
   * Both names are required here because organizer_profile.org_name_km is NOT
   * NULL and approval copies these straight across. Catching it in the form is
   * what keeps the failure from landing on an admin's approve click instead.
   */
  const validate = () => {
    const errors = {}
    if (!form.org_name_en.trim()) errors.org_name_en = 'Required'
    if (!form.org_name_km.trim()) errors.org_name_km = 'Required'
    if (form.message.length > MESSAGE_MAX) errors.message = `At most ${MESSAGE_MAX} characters`
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return

    setSubmitting(true)
    try {
      const created = await applyToBeOrganizer({ ...form, event_types: types.join(', ') })
      setApplication(created)
      setReapplying(false)
      setForm(EMPTY_FORM)
      setTypes([])
    } catch (e) {
      setError(messageFor(e))
      const code = e?.response?.data?.errorCode
      // The page was working from stale state. Reload it so what they see next
      // is the truth rather than a form they cannot submit.
      if (code === 'ALREADY_AN_ORGANIZER' || code === 'ORGANIZER_APPLICATION_ALREADY_PENDING') {
        await load()
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="container org-apply is-loading">Loading…</div>

  const showForm = !application || (application.status === 'REJECTED' && reapplying)

  return (
    <div className="container org-apply">
      <header className="org-apply-head">
        <h1>Become an organizer</h1>
        <p className="org-apply-head-km" lang="km">ក្លាយជាអ្នករៀបចំព្រឹត្តិការណ៍</p>
        <p className="org-apply-head-note">
          Tell us about your organization. A member of our team reviews every application,
          usually within 2 business days.
        </p>
      </header>

      {error && <div className="org-apply-error" role="alert">{error}</div>}

      {application?.status === 'PENDING' && <PendingCard application={application} />}

      {application?.status === 'REJECTED' && !reapplying && (
        <RejectedCard application={application} onRetry={() => setReapplying(true)} />
      )}

      {showForm && (
        <form className="card org-apply-form" onSubmit={submit} noValidate>
          <section className="org-apply-section">
            <h2>Organization</h2>
            <p className="org-apply-section-note">The name that appears on your event pages.</p>

            <Field
              id="org_name_en"
              label="Organization name (English)"
              required
              value={form.org_name_en}
              onChange={set('org_name_en')}
              error={fieldErrors.org_name_en}
              placeholder="Mekong Live Productions"
            />
            <Field
              id="org_name_km"
              label="Organization name (Khmer)"
              required
              lang="km"
              value={form.org_name_km}
              onChange={set('org_name_km')}
              error={fieldErrors.org_name_km}
              placeholder="ផលិតកម្មមេគង្គឡាយវ៍"
              hint="Shown to Khmer-language visitors."
            />
          </section>

          <section className="org-apply-section">
            <h2>How we reach you</h2>
            <p className="org-apply-section-note">At least one way for our reviewer to contact you.</p>

            <div className="org-apply-pair">
            <Field
              id="telegram_handle"
              label="Telegram"
              optional
              prefix="@"
              value={form.telegram_handle}
              onChange={set('telegram_handle')}
              placeholder="yourhandle"
            />
            <Field
              id="facebook_url"
              label="Facebook page"
              optional
              value={form.facebook_url}
              onChange={set('facebook_url')}
              placeholder="facebook.com/yourpage"
            />
            </div>
          </section>

          <section className="org-apply-section">
            <h2>About your events</h2>
            <p className="org-apply-section-note">Helps us review faster.</p>

            <fieldset className="org-apply-chips">
              <legend>What do you organize?</legend>
              <div className="org-apply-chips-row">
                {EVENT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="org-apply-chip"
                    aria-pressed={types.includes(type)}
                    onClick={() => toggleType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label className="label" htmlFor="message">
                Anything else?<span className="opt"> (optional)</span>
              </label>
              <span className="org-apply-counted">
                <textarea
                  id="message"
                  className="textarea"
                  rows={4}
                  value={form.message}
                  maxLength={MESSAGE_MAX}
                  onChange={set('message')}
                  placeholder="Tell us about past events you've run, your venue partners, or anything that helps us verify you."
                />
                <span className="org-apply-count">
                  {form.message.length} / {MESSAGE_MAX}
                </span>
              </span>
              {fieldErrors.message && <span className="org-apply-field-error">{fieldErrors.message}</span>}
            </div>
          </section>

          <div className="org-apply-foot">
            <p className="org-apply-note">
              <Icon name="info" size={16} />
              We'll notify you by Telegram and in the app once a decision is made.
            </p>

            <div className="org-apply-actions">
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

function PendingCard({ application }) {
  return (
    <section className="card org-apply-status is-pending">
      <h2>Application under review</h2>
      <p className="org-apply-status-meta">
        Submitted {new Date(application.submitted_at).toLocaleDateString()}
      </p>
      <p>
        A member of our team is looking at your application. We'll let you know as soon as
        there's a decision — usually within 2 business days.
      </p>
      <Summary application={application} />
    </section>
  )
}

function RejectedCard({ application, onRetry }) {
  return (
    <section className="card org-apply-status is-rejected">
      <h2>We couldn't approve this application</h2>
      {/* admin_note is required on REJECTED by a DB CHECK, so this is always
          present - a rejection the applicant cannot act on is worse than none. */}
      <blockquote className="org-apply-reason">{application.admin_note}</blockquote>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Apply again
      </button>
    </section>
  )
}

/** What they told us, so a pending applicant can check it without reapplying. */
function Summary({ application }) {
  return (
    <dl className="org-apply-summary">
      <dt>Organization</dt>
      <dd>
        {application.org_name_en}
        {application.org_name_km ? <span lang="km"> · {application.org_name_km}</span> : null}
      </dd>
      {application.telegram_handle && (
        <>
          <dt>Telegram</dt>
          <dd>{application.telegram_handle}</dd>
        </>
      )}
      {application.event_types && (
        <>
          <dt>Event types</dt>
          <dd>{application.event_types}</dd>
        </>
      )}
    </dl>
  )
}

function Field({ id, label, required, optional, hint, error, prefix, ...props }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span className="org-apply-req" aria-hidden="true"> *</span>}
        {optional && <span className="opt"> (optional)</span>}
      </label>
      {prefix ? (
        <span className="org-apply-prefixed">
          <span className="org-apply-prefix" aria-hidden="true">{prefix}</span>
          <input id={id} name={id} className="input" aria-invalid={!!error} {...props} />
        </span>
      ) : (
        <input id={id} name={id} className="input" aria-invalid={!!error} {...props} />
      )}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="org-apply-field-error">{error}</span>}
    </div>
  )
}
