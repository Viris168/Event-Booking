import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { SkeletonPanel, SkeletonRegion } from '../components/Skeleton.jsx'
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

/**
 * The field already draws the "@", so a typed or pasted one would be stored
 * twice. People also paste their t.me link; keep only the handle from it.
 */
const cleanTelegram = (value) =>
  value
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@+/, '')

/** What the rail on the right shows, in order. Index is the stage. */
const STAGES = [
  { title: 'Apply', note: 'Tell us who you are. It takes about three minutes.' },
  { title: 'Review', note: 'Our team checks your details, usually within 2 business days.' },
  { title: 'Start selling', note: 'Publish events, draw seat maps and take KHQR payments.' },
]

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

  const set = (name, clean = (v) => v) => (e) => {
    const value = clean(e.target.value)
    setForm((f) => ({ ...f, [name]: value }))
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
    // Field ids match the error keys, so the first failure can take focus -
    // on a phone the invalid field is often scrolled out of view by now.
    const first = Object.keys(errors)[0]
    if (first) document.getElementById(first)?.focus()
    return !first
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

  if (loading) {
    return (
      <div className="container org-apply">
        <SkeletonRegion label="Loading your application" className="org-apply-layout">
          <SkeletonPanel lines={6} />
          <SkeletonPanel lines={4} head={false} />
        </SkeletonRegion>
      </div>
    )
  }

  const showForm = !application || (application.status === 'REJECTED' && reapplying)
  // Where the rail puts its marker. A rejected applicant is back at the start.
  const stage = application?.status === 'PENDING' ? 1 : 0

  return (
    <div className="container org-apply">
      <header className="org-apply-head">
        <h1>Become an organizer</h1>
        <p className="org-apply-head-km" lang="km">ក្លាយជាអ្នករៀបចំព្រឹត្តិការណ៍</p>
        <p className="org-apply-head-note">
          Sell tickets to your concerts, festivals and conferences on CamboBook. Tell us about
          your organization and a member of our team will review it.
        </p>
      </header>

      <div className="org-apply-layout">
        <div className="org-apply-main">
          {error && (
            <div className="org-apply-error" role="alert">
              <Icon name="alert" size={16} />
              {error}
            </div>
          )}

          {application?.status === 'PENDING' && <PendingCard application={application} />}

          {application?.status === 'REJECTED' && !reapplying && (
            <RejectedCard application={application} onRetry={() => setReapplying(true)} />
          )}

          {showForm && (
            <form className="card org-apply-form" onSubmit={submit} noValidate>
              <Section n={1} title="Organization" note="The name that appears on your event pages and tickets.">
                <div className="org-apply-pair">
                  <Field
                    id="org_name_en"
                    label="Name in English"
                    required
                    value={form.org_name_en}
                    onChange={set('org_name_en')}
                    error={fieldErrors.org_name_en}
                    placeholder="Mekong Live Productions"
                    autoComplete="organization"
                  />
                  <Field
                    id="org_name_km"
                    label="Name in Khmer"
                    required
                    lang="km"
                    value={form.org_name_km}
                    onChange={set('org_name_km')}
                    error={fieldErrors.org_name_km}
                    placeholder="ផលិតកម្មមេគង្គឡាយវ៍"
                    hint="Shown to visitors browsing in Khmer."
                  />
                </div>
              </Section>

              <Section
                n={2}
                title="How we reach you"
                note="Optional, but a reviewer will message you here if anything needs checking."
              >
                <div className="org-apply-pair">
                  <Field
                    id="telegram_handle"
                    label="Telegram"
                    icon="telegram"
                    prefix="@"
                    value={form.telegram_handle}
                    onChange={set('telegram_handle', cleanTelegram)}
                    placeholder="yourhandle"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <Field
                    id="facebook_url"
                    label="Facebook page"
                    icon="facebook"
                    type="url"
                    inputMode="url"
                    value={form.facebook_url}
                    onChange={set('facebook_url')}
                    placeholder="facebook.com/yourpage"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
              </Section>

              <Section n={3} title="About your events" note="Optional. The more we know, the faster the review.">
                <fieldset className="org-apply-chips">
                  <legend>What do you organize?</legend>
                  <div className="org-apply-chips-row">
                    {EVENT_TYPES.map((type) => {
                      const on = types.includes(type)
                      return (
                        <button
                          key={type}
                          type="button"
                          className="org-apply-chip"
                          aria-pressed={on}
                          onClick={() => toggleType(type)}
                        >
                          {on && <Icon name="check" size={13} strokeWidth={2.75} />}
                          {type}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div className={`field${fieldErrors.message ? ' has-error' : ''}`}>
                  <label className="label" htmlFor="message">
                    Anything else?
                  </label>
                  <span className="org-apply-counted">
                    <textarea
                      id="message"
                      className="textarea"
                      rows={5}
                      value={form.message}
                      maxLength={MESSAGE_MAX}
                      onChange={set('message')}
                      aria-invalid={!!fieldErrors.message}
                      aria-describedby={fieldErrors.message ? 'message-message' : undefined}
                      placeholder="Past events you've run, venues you work with, or anything that helps us verify you."
                    />
                    <span
                      className={`org-apply-count${form.message.length > MESSAGE_MAX * 0.9 ? ' is-near' : ''}`}
                      aria-hidden="true"
                    >
                      {form.message.length} / {MESSAGE_MAX}
                    </span>
                  </span>
                  {fieldErrors.message && (
                    <span className="err" id="message-message">{fieldErrors.message}</span>
                  )}
                </div>
              </Section>

              <div className="org-apply-foot">
                <p className="org-apply-note">
                  <Icon name="bell" size={16} />
                  We'll tell you the decision by Telegram and in your notifications.
                </p>

                <div className="org-apply-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit application'}
                    {!submitting && <Icon name="arrowRight" size={16} />}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        <aside className="org-apply-aside" aria-label="How it works">
          <h2>How it works</h2>
          <ol className="org-apply-stages">
            {STAGES.map((s, i) => (
              <li
                key={s.title}
                className={i < stage ? 'is-done' : i === stage ? 'is-current' : undefined}
                aria-current={i === stage ? 'step' : undefined}
              >
                <span className="org-apply-stage-mark" aria-hidden="true">
                  {i < stage ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <span className="org-apply-stage-note">{s.note}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="org-apply-need">
            <h3>Have these ready</h3>
            <ul>
              <li>Your organization's name in English and Khmer</li>
              <li>A Telegram handle or Facebook page, if you have one</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** One numbered block of the form. */
function Section({ n, title, note, children }) {
  const id = `org-apply-s${n}`
  return (
    <section className="org-apply-section" aria-labelledby={id}>
      <div className="org-apply-section-head">
        <span className="org-apply-num" aria-hidden="true">{n}</span>
        <div>
          <h2 id={id}>{title}</h2>
          {note && <p className="org-apply-section-note">{note}</p>}
        </div>
      </div>
      <div className="org-apply-section-body">{children}</div>
    </section>
  )
}

function PendingCard({ application }) {
  return (
    <section className="card org-apply-status is-pending">
      <span className="org-apply-status-tag">
        <Icon name="clock" size={14} />
        Under review
      </span>
      <h2>We've got your application</h2>
      <p className="org-apply-status-meta">
        Submitted {new Date(application.submitted_at).toLocaleDateString()}
      </p>
      <p>
        A member of our team is looking at it now. We'll let you know as soon as there's a
        decision, usually within 2 business days.
      </p>
      <Summary application={application} />
    </section>
  )
}

function RejectedCard({ application, onRetry }) {
  return (
    <section className="card org-apply-status is-rejected">
      <span className="org-apply-status-tag">
        <Icon name="xCircle" size={14} />
        Not approved
      </span>
      <h2>We couldn't approve this application</h2>
      {application.submitted_at && (
        <p className="org-apply-status-meta">
          Submitted {new Date(application.submitted_at).toLocaleDateString()}
        </p>
      )}
      {/* admin_note is required on REJECTED by a DB CHECK, so this is always
          present - a rejection the applicant cannot act on is worse than none. */}
      <figure className="org-apply-reason">
        <figcaption>Note from the reviewer</figcaption>
        <blockquote>{application.admin_note}</blockquote>
      </figure>
      <p>Fix what the note mentions and send a new application. Your details start blank.</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        <Icon name="refresh" size={16} />
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
          <dd>@{application.telegram_handle.replace(/^@+/, '')}</dd>
        </>
      )}
      {application.facebook_url && (
        <>
          <dt>Facebook</dt>
          <dd className="org-apply-summary-url">{application.facebook_url}</dd>
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

function Field({ id, label, required, hint, error, prefix, icon, ...props }) {
  const messageId = error || hint ? `${id}-message` : undefined
  const input = (
    <input
      id={id}
      name={id}
      className="input"
      aria-invalid={!!error}
      aria-required={required || undefined}
      aria-describedby={messageId}
      {...props}
    />
  )
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="label" htmlFor={id}>
        {icon && (
          <span className={`org-apply-label-icon is-${icon}`} aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        )}
        {label}
        {required && <span className="org-apply-req" aria-hidden="true"> *</span>}
      </label>
      {prefix ? (
        <span className="org-apply-prefixed">
          <span className="org-apply-prefix" aria-hidden="true">{prefix}</span>
          {input}
        </span>
      ) : (
        input
      )}
      {error ? (
        <span className="err" id={messageId}>{error}</span>
      ) : hint ? (
        <span className="hint" id={messageId}>{hint}</span>
      ) : null}
    </div>
  )
}
