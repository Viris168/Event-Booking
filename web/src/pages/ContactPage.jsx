import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.js'
import { sendContactMessage } from '../api/contact.js'

/*
 * The platform's own contact channels.
 *
 * "#" and "" are placeholders, standing in until the real accounts exist. This
 * is the same rule Footer.jsx applies to its social row, for the same reason: a
 * guessed handle is worse than no link, because t.me/<something plausible>
 * almost certainly belongs to a stranger and this page would be handing them
 * every visitor with a problem.
 *
 * An entry with an empty `value` is skipped entirely, so deleting the value
 * deletes the row. Fill these in and nothing else needs to change - `href`
 * builds the link from the value, and the form below is unaffected either way,
 * because the form is the channel that already works.
 */
const CHANNELS = [
  {
    key: 'telegram',
    icon: 'telegram',
    label: { en: 'Telegram', km: 'តេឡេក្រាម' },
    value: '',
    href: (v) => `https://t.me/${v.replace(/^@/, '')}`,
  },
  {
    key: 'email',
    icon: 'mail',
    label: { en: 'Email', km: 'អ៊ីមែល' },
    value: '',
    href: (v) => `mailto:${v}`,
  },
  {
    key: 'facebook',
    icon: 'facebook',
    label: { en: 'Facebook', km: 'ហ្វេសប៊ុក' },
    value: '',
    href: (v) => (v.startsWith('http') ? v : `https://${v}`),
  },
]

/**
 * The topics the API will accept. Mirrors the ContactTopic enum and the CHECK
 * constraint in V33 - adding one here without adding it there is a 400 at
 * submit, so the two lists move together.
 */
const TOPICS = [
  { value: 'BOOKING', en: 'A ticket or a booking', km: 'សំបុត្រ ឬការកក់' },
  { value: 'PAYMENT', en: 'A payment problem', km: 'បញ្ហាការទូទាត់' },
  { value: 'ORGANIZER', en: 'Running events on CamboBook', km: 'ការរៀបចំព្រឹត្តិការណ៍' },
  { value: 'TECHNICAL', en: 'Something on the site is broken', km: 'បញ្ហាបច្ចេកទេស' },
  { value: 'OTHER', en: 'Something else', km: 'ផ្សេងទៀត' },
]

const BODY_MAX = 5000

/**
 * Errors this page can actually provoke, and what they mean to the sender.
 *
 * The 429 is the one worth wording carefully. It is reachable by somebody
 * honest - see ContactRateLimiter, which counts submissions rather than
 * failures because a contact form has no failures to count - so the message
 * says when to come back rather than implying they did something wrong.
 */
function messageFor(error, km) {
  const data = error?.response?.data
  const code = data?.errorCode

  if (code === 'TOO_MANY_CONTACT_MESSAGES') {
    const seconds = data?.details?.retry_after_seconds
    const minutes = seconds ? Math.max(1, Math.ceil(seconds / 60)) : null
    if (km) {
      return minutes
        ? `យើងបានទទួលសាររបស់អ្នករួចហើយ។ សូមរង់ចាំ ${minutes} នាទី មុននឹងផ្ញើម្តងទៀត។`
        : 'យើងបានទទួលសាររបស់អ្នករួចហើយ។ សូមរង់ចាំបន្តិចមុននឹងផ្ញើម្តងទៀត។'
    }
    return minutes
      ? `We already have your message. Please give us ${minutes} minute${minutes === 1 ? '' : 's'} before sending another.`
      : 'We already have your message. Please give us a few minutes before sending another.'
  }
  if (code === 'VALIDATION_ERROR') {
    return km
      ? 'សូមពិនិត្យប្រអប់ដែលបានបន្លិច រួចព្យាយាមម្តងទៀត។'
      : 'Please check the highlighted fields and try again.'
  }
  if (!error?.response) {
    return km
      ? 'មិនអាចទាក់ទងម៉ាស៊ីនមេបានទេ។ សូមពិនិត្យការតភ្ជាប់ រួចព្យាយាមម្តងទៀត។'
      : 'Could not reach the server. Check your connection and try again.'
  }
  return km ? 'មានបញ្ហាកើតឡើង។ សូមព្យាយាមម្តងទៀត។' : 'Something went wrong. Please try again.'
}

export default function ContactPage() {
  const { t, locale, dateTime } = useLocale()
  const { user, isAuthenticated } = useAuth()
  const km = locale === 'km'

  useDocumentTitle(km ? 'ទំនាក់ទំនង' : 'Contact')

  /*
   * Prefilled from the account when there is one, and editable afterwards.
   *
   * The server stores what is in these boxes, never what the session says -
   * somebody writing about a relative's booking puts that person's details in,
   * and the API is explicit about not "correcting" them. So prefilling is a
   * convenience and nothing more, which is exactly why the fields stay
   * editable rather than being locked to the account.
   */
  const [form, setForm] = useState({
    sender_name: user?.display_name ?? '',
    reply_to: user?.email ?? '',
    telegram_username: user?.telegram_username ?? '',
    topic: 'BOOKING',
    subject: '',
    body: '',
    booking_ref: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const set = (name) => (e) => {
    setForm((f) => ({ ...f, [name]: e.target.value }))
    setFieldErrors((f) => ({ ...f, [name]: undefined }))
    setError('')
  }

  /**
   * Checked here as well as on the server, and the server is the one that
   * counts. This pass exists so the four required fields fail under their own
   * labels instead of as one banner over a form the sender has to re-read.
   */
  const validate = () => {
    const errors = {}
    const required = km ? 'ត្រូវការ' : 'Required'
    if (!form.sender_name.trim()) errors.sender_name = required
    if (!form.subject.trim()) errors.subject = required
    if (!form.body.trim()) errors.body = required
    // Shape only. Whether an address is real is settled by whether the reply
    // arrives, which no pattern can decide - this catches a typed sentence.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.reply_to.trim())) {
      errors.reply_to = km ? 'សូមបញ្ចូលអ៊ីមែលត្រឹមត្រូវ' : 'Enter an email address we can reply to'
    }
    /*
     * The same @Pattern the DTO carries. Repeated here for the reason the rest
     * of this function exists: without it a reference with a space in it comes
     * back as a VALIDATION_ERROR banner over the whole form, and the sender has
     * to re-read six fields to find the one that is wrong. It is optional, so
     * an empty box is not an error - only a filled one that is not a reference.
     */
    if (form.booking_ref.trim() && !/^[A-Za-z0-9_-]+$/.test(form.booking_ref.trim())) {
      errors.booking_ref = km
        ? 'អក្សរ លេខ សហ និងអ៊ុនឌឺស្កូរ ប៉ុណ្ណោះ'
        : 'Letters, digits, dashes and underscores only'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (sending) return
    if (!validate()) return

    setSending(true)
    setError('')
    try {
      setReceipt(await sendContactMessage(form))
    } catch (err) {
      setError(messageFor(err, km))
    } finally {
      setSending(false)
    }
  }

  const channels = CHANNELS.filter((c) => c.value)

  /* --------------------------------------------------------------- sent */
  if (receipt) {
    return (
      <div className="container contact">
        <section className="card contact-sent">
          <span className="contact-sent-mark" aria-hidden="true">
            <Icon name="checkCircle" size={26} />
          </span>
          <h1>{km ? 'យើងបានទទួលសាររបស់អ្នក' : 'Your message is with us'}</h1>
          <p>
            {km
              ? 'យើងនឹងឆ្លើយតបទៅកាន់អាសយដ្ឋានដែលអ្នកបានផ្តល់។ ជាធម្មតាក្នុងរយៈពេលមួយថ្ងៃធ្វើការ។'
              : 'We will reply to the address you gave us, usually within one business day.'}
          </p>

          {/*
            The id is what they quote if they have to chase it, so it is
            rendered large and in the mono face the rest of the product uses
            for references. It is the entire reason the API answers with a
            receipt rather than with nothing.
          */}
          <dl className="contact-receipt">
            <div>
              <dt>{km ? 'លេខយោង' : 'Reference'}</dt>
              <dd className="mono">#{receipt.id}</dd>
            </div>
            <div>
              <dt>{km ? 'ទទួលបាននៅ' : 'Received'}</dt>
              <dd>{dateTime(receipt.received_at)}</dd>
            </div>
          </dl>

          <div className="contact-sent-actions">
            <Link className="btn btn-outline" to="/events">
              {t('events')}
            </Link>
            {isAuthenticated && (
              <Link className="btn btn-ghost" to="/my-bookings">
                {t('myBookings')}
              </Link>
            )}
          </div>
        </section>
      </div>
    )
  }

  /* --------------------------------------------------------------- form */
  return (
    <div className="container contact">
      <header className="contact-head">
        <h1>{km ? 'ទំនាក់ទំនងមកយើង' : 'Contact us'}</h1>
        <p>
          {km
            ? 'អ្នកមិនចាំបាច់មានគណនីដើម្បីសរសេរមកទេ។ យើងឆ្លើយតបតាមអ៊ីមែល ជាធម្មតាក្នុងរយៈពេលមួយថ្ងៃធ្វើការ។'
            : 'You do not need an account to write to us, which matters most when the reason you are writing is that you cannot get into yours. We reply by email, usually within one business day.'}
        </p>
      </header>

      <div className="contact-split">
        {/* ------------------------------------------------------- the form */}
        <form className="card contact-form" onSubmit={submit} noValidate>
          <section className="contact-section">
            <h2>{km ? 'របៀបឆ្លើយតបទៅអ្នក' : 'How we reply to you'}</h2>
            <p className="contact-section-note">
              {km
                ? 'សរសេរឈ្មោះ និងអាសយដ្ឋានរបស់អ្នកដែលចង់ឲ្យយើងឆ្លើយតបទៅ។'
                : 'Give the name and address the reply should go to. If you are writing about somebody else’s booking, use theirs.'}
            </p>

            <div className="contact-pair">
              <Field
                id="sender_name"
                label={km ? 'ឈ្មោះ' : 'Your name'}
                required
                value={form.sender_name}
                onChange={set('sender_name')}
                error={fieldErrors.sender_name}
                autoComplete="name"
                placeholder={km ? 'សុខា ចន្ទ' : 'Sokha Chan'}
              />
              <Field
                id="reply_to"
                label={km ? 'អ៊ីមែល' : 'Email'}
                required
                type="email"
                value={form.reply_to}
                onChange={set('reply_to')}
                error={fieldErrors.reply_to}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <Field
              id="telegram_username"
              label={km ? 'តេឡេក្រាម' : 'Telegram'}
              optional
              prefix="@"
              value={form.telegram_username}
              onChange={set('telegram_username')}
              placeholder="yourhandle"
              hint={
                km
                  ? 'បើងាយស្រួលឆ្លើយតបតាមតេឡេក្រាមជាង។'
                  : 'If a Telegram message would reach you faster than email.'
              }
            />
          </section>

          <section className="contact-section">
            <h2>{km ? 'អ្វីដែលអ្នកចង់ប្រាប់' : 'What it is about'}</h2>

            <div className="field">
              <label className="label" htmlFor="topic">
                {km ? 'ប្រធានបទ' : 'Topic'}
              </label>
              <select id="topic" className="select" value={form.topic} onChange={set('topic')}>
                {TOPICS.map((topic) => (
                  <option key={topic.value} value={topic.value}>
                    {km ? topic.km : topic.en}
                  </option>
                ))}
              </select>
            </div>

            <Field
              id="subject"
              label={km ? 'ចំណងជើង' : 'Subject'}
              required
              value={form.subject}
              onChange={set('subject')}
              error={fieldErrors.subject}
              maxLength={200}
              placeholder={
                km ? 'សំបុត្រមិនបានមកដល់' : 'My ticket never arrived'
              }
            />

            {/* Only offered where it means something. On a payment or booking
                question the reference is the single most useful thing the
                sender can give us; on "how do I run an event" it is a box that
                invites them to wonder what they are missing. */}
            {(form.topic === 'BOOKING' || form.topic === 'PAYMENT') && (
              <Field
                id="booking_ref"
                label={km ? 'លេខយោងការកក់' : 'Booking reference'}
                optional
                value={form.booking_ref}
                onChange={set('booking_ref')}
                error={fieldErrors.booking_ref}
                maxLength={64}
                placeholder="CB-XXXXXX"
                hint={
                  km
                    ? 'បើអ្នករកឃើញ។ វាជួយឲ្យយើងរកការកក់បានលឿន។'
                    : 'If you have it to hand. Copy it as written, even if you think it is wrong.'
                }
              />
            )}

            <div className={`field${fieldErrors.body ? ' has-error' : ''}`}>
              <label className="label" htmlFor="body">
                {km ? 'សារ' : 'Message'}
                <span className="contact-req" aria-hidden="true"> *</span>
              </label>
              <span className="contact-counted">
                <textarea
                  id="body"
                  className="textarea"
                  rows={7}
                  value={form.body}
                  maxLength={BODY_MAX}
                  onChange={set('body')}
                  aria-invalid={!!fieldErrors.body}
                  placeholder={
                    km
                      ? 'ប្រាប់យើងពីអ្វីដែលបានកើតឡើង ព្រឹត្តិការណ៍ណា និងពេលណា។'
                      : 'What happened, which event, and roughly when. Detail helps more than politeness.'
                  }
                />
                <span className="contact-count">
                  {form.body.length} / {BODY_MAX}
                </span>
              </span>
              {fieldErrors.body && <span className="contact-field-error">{fieldErrors.body}</span>}
            </div>
          </section>

          <div className="contact-foot">
            {error && (
              <p className="contact-error" role="alert">
                <Icon name="alert" size={16} />
                {error}
              </p>
            )}
            <p className="contact-note">
              <Icon name="info" size={16} />
              {km
                ? 'យើងប្រើព័ត៌មានទាំងនេះដើម្បីឆ្លើយតបនឹងសាររបស់អ្នកតែប៉ុណ្ណោះ។'
                : 'We use what you write here to answer you, and for nothing else.'}
            </p>
            <button type="submit" className="btn btn-primary btn-lg" disabled={sending}>
              {sending
                ? km
                  ? 'កំពុងផ្ញើ…'
                  : 'Sending…'
                : km
                  ? 'ផ្ញើសារ'
                  : 'Send message'}
            </button>
          </div>
        </form>

        {/* ----------------------------------------------------------- aside */}
        <aside className="contact-aside">
          {/*
            Routing before channels. Most of what arrives in a support inbox is
            something the sender could have done in two clicks, and the honest
            thing is to say so here rather than to say it back to them a day
            later in a reply.
          */}
          <section className="card contact-card">
            <h2>{km ? 'អាចលឿនជាងនេះ' : 'Faster than writing'}</h2>
            <ul className="contact-routes">
              <li>
                <span>{km ? 'សំបុត្រ និង QR របស់អ្នក' : 'Your tickets and QR codes'}</span>
                <Link to="/my-bookings">{t('myBookings')}</Link>
              </li>
              <li>
                <span>{km ? 'ចង់រៀបចំព្រឹត្តិការណ៍' : 'Applying to run events'}</span>
                <Link to={isAuthenticated ? '/become-an-organizer' : '/login'}>
                  {t('becomeOrganizer')}
                </Link>
              </li>
              <li>
                <span>{km ? 'របៀបដំណើរការ' : 'How the platform works'}</span>
                <Link to="/about">{t('aboutUs')}</Link>
              </li>
            </ul>
          </section>

          {/*
            Rendered only once a channel is real. `channels` filters on a
            non-empty value, so the whole card disappears while CHANNELS holds
            placeholders rather than showing a heading over three dead rows -
            an empty "Other ways to reach us" is worse than not claiming there
            are any.
          */}
          {channels.length > 0 && (
            <section className="card contact-card">
              <h2>{km ? 'មធ្យោបាយផ្សេងទៀត' : 'Other ways to reach us'}</h2>
              <ul className="contact-channels">
                {channels.map((c) => (
                  <li key={c.key}>
                    <a href={c.href(c.value)} target="_blank" rel="noreferrer noopener">
                      <Icon name={c.icon} size={16} />
                      <span>
                        <b>{km ? c.label.km : c.label.en}</b>
                        {c.value}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card contact-card">
            <h2>{km ? 'ពេលវេលាឆ្លើយតប' : 'When we answer'}</h2>
            <p className="contact-hours">
              {km
                ? 'ថ្ងៃច័ន្ទ ដល់ ថ្ងៃសុក្រ ម៉ោង ៨ៈ០០ ដល់ ១៧ៈ០០ (ម៉ោងនៅកម្ពុជា)។ សារដែលផ្ញើនៅចុងសប្តាហ៍ត្រូវបានឆ្លើយតបនៅថ្ងៃច័ន្ទ។'
                : 'Monday to Friday, 8:00 to 17:00 Cambodia time. Anything sent over the weekend is answered on Monday.'}
            </p>
            <p className="contact-hours-note">
              {km
                ? 'បើអ្នកកំពុងឈរនៅច្រកចូល ហើយសំបុត្រមិនស្កេនចូល សូមទាក់ទងអ្នករៀបចំព្រឹត្តិការណ៍ផ្ទាល់ — ពួកគេនៅទីនោះ ហើយយើងមិននៅ។'
                : 'If you are standing at the door and your ticket will not scan, find the organiser rather than us. They are there and we are not.'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

/**
 * The same field shape BecomeOrganizerPage uses, kept local for the same
 * reason it is local there: it is a thin wrapper over .field / .label / .input,
 * and the two pages phrase their labels and hints quite differently. Promoting
 * it to components/ would create a shared API that neither page wants yet.
 */
function Field({ id, label, required, optional, hint, error, prefix, ...props }) {
  // The one string in this component that is not passed in. Everything else
  // arrives already in the right language from the caller; "(optional)" is
  // structural, so it reads the locale itself rather than making every call
  // site carry a translation of the same word.
  const { locale } = useLocale()

  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="label" htmlFor={id}>
        {label}
        {required && (
          <span className="contact-req" aria-hidden="true">
            {' '}
            *
          </span>
        )}
        {optional && (
          <span className="opt"> {locale === 'km' ? '(ស្រេចចិត្ត)' : '(optional)'}</span>
        )}
      </label>
      {prefix ? (
        <span className="contact-prefixed">
          <span className="contact-prefix" aria-hidden="true">
            {prefix}
          </span>
          <input id={id} name={id} className="input" aria-invalid={!!error} {...props} />
        </span>
      ) : (
        <input id={id} name={id} className="input" aria-invalid={!!error} {...props} />
      )}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="contact-field-error">{error}</span>}
    </div>
  )
}
