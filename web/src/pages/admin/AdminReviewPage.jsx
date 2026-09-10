import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, BiTitle, Empty, Field, Pager } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  approveEvent,
  getReviewQueue,
  rejectEvent,
  requestEventChanges,
} from '../../api/admin.js'

/*
 * The moderation queue.
 *
 * A separate screen from AdminEventsPage on purpose. That page is a directory
 * you browse - every event, any status, filtered and searched. This is a queue
 * you work through: one default status, oldest first, and a count of what is
 * left. Different sort, different default, different primary action.
 */

// Which statuses are worth queueing on. Not all seven: DRAFT is nobody's
// business but the organiser's, and PUBLISHED belongs in the directory.
const QUEUES = ['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED']

/*
 * Belt and braces. GET /admin/event already scopes available_actions to the
 * admin, so this filter should never remove anything - it is here so that a
 * future endpoint returning the raw status-scoped list (which includes
 * WITHDRAW, the ORGANISER's action out of PENDING_REVIEW) cannot make this
 * page render a button the server will answer with 403.
 *
 * TAKE_DOWN is deliberately absent: it applies to PUBLISHED events, which
 * belong in the directory at /admin/events, not in a review queue.
 */
const ADMIN_ACTIONS = new Set(['APPROVE', 'REJECT', 'REQUEST_CHANGES'])

const PAGE_SIZE = 20

/** Snake_case from the API, camelCase if anything ever maps it. Same rule as adapters.js. */
const pick = (obj, snake, camel) => obj?.[snake] ?? obj?.[camel]

export default function AdminReviewPage() {
  // `status` from the locale context is the label formatter; the local `status`
  // state is the selected queue. Renamed here so the two never collide.
  const { t, locale, date, status: statusLabel } = useLocale()
  useDocumentTitle(locale === 'km' ? 'ជួរត្រួតពិនិត្យ' : 'Review queue')
  const toast = useToast()
  const km = locale === 'km'

  const [status, setStatus] = useState('PENDING_REVIEW')
  const [page, setPage] = useState(0) // 0-indexed, like Spring's Pageable
  const [data, setData] = useState({ content: [], totalPages: 0, totalElements: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Bumped after every decision to force a refetch: an approved event leaves
  // PENDING_REVIEW, so the row must disappear from the list it was clicked in.
  const [version, setVersion] = useState(0)

  // The pending decision: { id, action, title }, or null. Both REJECT and
  // REQUEST_CHANGES need a message, so they share one dialog.
  const [deciding, setDeciding] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  /*
   * The effect only WRITES results, never the pending flag.
   *
   * setLoading(true) at the top of an effect body is a synchronous setState
   * during render-commit, which React flags as a cascading render. Every way
   * into a refetch is a user action, so each one turns the flag on itself and
   * the effect turns it off - which is the pattern React actually recommends.
   * Initial state is already `true`, covering the first load.
   */
  useEffect(() => {
    let live = true
    getReviewQueue({ status, page, size: PAGE_SIZE })
      .then((res) => {
        if (!live) return
        setLoadError(false)
        setData({
          content: res?.content ?? [],
          totalPages: res?.totalPages ?? res?.total_pages ?? 0,
          totalElements: res?.totalElements ?? res?.total_elements ?? 0,
        })
      })
      .catch(() => {
        if (!live) return
        setLoadError(true)
        setData({ content: [], totalPages: 0, totalElements: 0 })
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [status, page, version])

  // Changing the queue resets to the first page: page 3 of PENDING_REVIEW is
  // meaningless in REJECTED and would render an empty screen that looks broken.
  const changeStatus = (next) => {
    setLoading(true)
    setStatus(next)
    setPage(0)
  }

  const changePage = (next) => {
    setLoading(true)
    setPage(next)
  }

  const refresh = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  async function approve(event) {
    setBusy(true)
    try {
      await approveEvent(event.id)
      toast(km ? 'បានអនុម័ត' : 'Approved', 'success')
      refresh()
    } catch (e) {
      toast(errorText(e, km ? 'អនុម័តមិនបានសម្រេច' : 'Could not approve'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submitDecision() {
    if (!deciding || !message.trim()) return
    setBusy(true)
    try {
      if (deciding.action === 'REJECT') {
        await rejectEvent(deciding.id, message.trim())
        toast(km ? 'បានបដិសេធ' : 'Rejected', 'success')
      } else {
        await requestEventChanges(deciding.id, message.trim())
        toast(km ? 'បានស្នើសុំការកែប្រែ' : 'Changes requested', 'success')
      }
      setDeciding(null)
      setMessage('')
      refresh()
    } catch (e) {
      toast(errorText(e, km ? 'មិនបានសម្រេច' : 'Could not save decision'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const rows = data.content

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{km ? 'ជួរត្រួតពិនិត្យ' : 'Review queue'}</h1>
          <p>
            {km
              ? 'ព្រឹត្តិការណ៍ដែលកំពុងរង់ចាំការសម្រេចចិត្ត ដោយរៀបតាមលំដាប់ដាក់ស្នើមុនគេ។'
              : 'Events waiting on a decision, oldest submission first.'}
          </p>
        </div>
        <Link className="btn" to="/admin/events">
          <Icon name="grid" size={16} />
          {t('moderation')}
        </Link>
      </div>

      <div className="panel" style={{ marginBottom: '1.2rem' }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={t('status')}>
              <select
                className="select"
                value={status}
                onChange={(e) => changeStatus(e.target.value)}
              >
                {QUEUES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="ml-auto muted small" aria-live="polite">
              {loading
                ? km
                  ? 'កំពុងផ្ទុក…'
                  : 'Loading…'
                : km
                  ? `នៅសល់ ${data.totalElements}`
                  : `${data.totalElements} remaining`}
            </div>
          </div>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" title={km ? 'មិនអាចផ្ទុកជួរបានទេ' : 'Could not load the queue'}>
          {km
            ? 'សូមពិនិត្យថាអ្នកកំពុងចូលជាអ្នកគ្រប់គ្រងប្រព័ន្ធ។'
            : 'Check that you are signed in as a platform admin.'}
        </Alert>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <Empty
          icon="checkCircle"
          title={km ? 'គ្មានអ្វីត្រូវត្រួតពិនិត្យទេ' : 'Nothing to review'}
        >
          {km
            ? 'ជួរនេះទទេ។ ព្រឹត្តិការណ៍ថ្មីនឹងបង្ហាញនៅទីនេះ នៅពេលអ្នកចាត់ចែងដាក់ស្នើ។'
            : 'The queue is empty. Submitted events appear here.'}
        </Empty>
      )}

      <div className="stack">
        {rows.map((event, i) => {
          const actions = (pick(event, 'available_actions', 'availableActions') ?? []).filter((a) =>
            ADMIN_ACTIONS.has(a),
          )
          const submittedAt = pick(event, 'submitted_at', 'submittedAt')
          const latest = pick(event, 'latest_review', 'latestReview')
          const venue = event.venue

          return (
            <div className="panel" key={event.id}>
              <div className="panel-body">
                <div className="row" style={{ alignItems: 'flex-start', gap: '1rem' }}>
                  <div className="flex-auto min-w-0">
                    <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                      <span className="muted small mono">
                        {page * PAGE_SIZE + i + 1}/{data.totalElements}
                      </span>
                      <Badge status={event.status} />
                    </div>

                    <BiTitle record={event} as="h3" />

                    <div className="muted small" style={{ marginTop: '0.35rem' }}>
                      {venue && (
                        <>
                          <Icon name="mapPin" size={13} />{' '}
                          {km
                            ? (pick(venue, 'name_km', 'nameKm') ?? pick(venue, 'name_en', 'nameEn'))
                            : pick(venue, 'name_en', 'nameEn')}
                          {' · '}
                        </>
                      )}
                      {submittedAt ? (
                        <>
                          <Icon name="clock" size={13} />{' '}
                          {km ? 'ដាក់ស្នើ ' : 'submitted '}
                          {date(submittedAt)}
                        </>
                      ) : (
                        <em>{km ? 'មិនទាន់ដាក់ស្នើ' : 'never submitted'}</em>
                      )}
                    </div>

                    {/* What is actually being reviewed, rendered from the
                        payload the queue already returned.

                        Not a link to /events/{id}: that page reads
                        GET /event/{id}, which serves only publicly-visible
                        statuses and 404s on everything in this queue. An admin
                        event-detail route is the proper fix; until it exists a
                        dead link on every row is worse than no link, and the
                        response carries these fields anyway. */}
                    <div
                      className="row muted small"
                      style={{ marginTop: '0.6rem', gap: '1.2rem', flexWrap: 'wrap' }}
                    >
                      <Fact label={km ? 'ចាប់ផ្តើម' : 'Starts'}>
                        {event.starts_at ? date(event.starts_at) : '—'}
                      </Fact>
                      <Fact label={km ? 'លក់សំបុត្រ' : 'On sale'}>
                        {event.sales_open_at ? date(event.sales_open_at) : '—'}
                        {' → '}
                        {event.sales_close_at ? date(event.sales_close_at) : '—'}
                      </Fact>
                      <Fact label={km ? 'ចំណុះ' : 'Capacity'}>{event.total_capacity ?? 0}</Fact>
                      <Fact label={km ? 'ប្រភេទ' : 'Inventory'}>
                        {event.inventory_mode ?? '—'}
                      </Fact>
                    </div>

                    {/* An event with nothing to sell cannot be approved into a
                        useful state. submit() already refuses one, so this is
                        a belt-and-braces signal rather than a gate. */}
                    {!event.total_capacity && (
                      <p className="small" style={{ color: 'var(--danger, #c0392b)' }}>
                        <Icon name="alert" size={13} />{' '}
                        {km ? 'គ្មានសំបុត្រលក់ទេ' : 'Nothing on sale yet'}
                      </p>
                    )}

                    {/* A resubmission after CHANGES_REQUESTED: show what was
                        asked for last time, so the admin is not re-reading the
                        whole event to remember why it came back. */}
                    {latest?.message && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <Alert tone="info" title={`${latest.action} · ${latest.actor_name ?? latest.actorName ?? ''}`}>
                          <span className="small">{latest.message}</span>
                        </Alert>
                      </div>
                    )}
                  </div>

                  <div className="stack" style={{ gap: '0.4rem', minWidth: '11rem' }}>
                    {actions.includes('APPROVE') && (
                      <button
                        className="btn btn-primary btn-block"
                        disabled={busy}
                        onClick={() => approve(event)}
                      >
                        <Icon name="check" size={15} />
                        {km ? 'អនុម័ត' : 'Approve'}
                      </button>
                    )}

                    {actions.includes('REQUEST_CHANGES') && (
                      <button
                        className="btn btn-block"
                        disabled={busy}
                        onClick={() => {
                          setMessage('')
                          setDeciding({ id: event.id, action: 'REQUEST_CHANGES' })
                        }}
                      >
                        <Icon name="edit" size={15} />
                        {km ? 'ស្នើសុំកែប្រែ' : 'Request changes'}
                      </button>
                    )}

                    {actions.includes('REJECT') && (
                      <button
                        className="btn btn-danger btn-block"
                        disabled={busy}
                        onClick={() => {
                          setMessage('')
                          setDeciding({ id: event.id, action: 'REJECT' })
                        }}
                      >
                        <Icon name="xCircle" size={15} />
                        {km ? 'បដិសេធ' : 'Reject'}
                      </button>
                    )}

                    {actions.length === 0 && (
                      <span className="muted small">
                        {km ? 'គ្មានសកម្មភាព' : 'No actions available'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pager counts from 1; Spring's Pageable counts from 0. */}
      <Pager page={page + 1} pages={data.totalPages} onChange={(n) => changePage(n - 1)} />

      {/* REJECT is terminal and REQUEST_CHANGES sends the event back to the
          organiser - both need a reason, and the server rejects a blank one. */}
      <ConfirmDialog
        open={Boolean(deciding)}
        tone={deciding?.action === 'REJECT' ? 'danger' : 'warn'}
        busy={busy}
        title={
          deciding?.action === 'REJECT'
            ? km
              ? 'បដិសេធព្រឹត្តិការណ៍នេះ?'
              : 'Reject this event?'
            : km
              ? 'ស្នើសុំការកែប្រែ?'
              : 'Request changes?'
        }
        confirmLabel={
          deciding?.action === 'REJECT'
            ? km
              ? 'បដិសេធ'
              : 'Reject'
            : km
              ? 'ផ្ញើ'
              : 'Send'
        }
        onConfirm={submitDecision}
        onClose={() => {
          setDeciding(null)
          setMessage('')
        }}
      >
        <p className="small muted">
          {deciding?.action === 'REJECT'
            ? km
              ? 'ការបដិសេធគឺជាចុងក្រោយ — អ្នកចាត់ចែងមិនអាចដាក់ស្នើវាឡើងវិញបានទេ។'
              : 'Rejection is final — the organiser cannot resubmit this event.'
            : km
              ? 'ព្រឹត្តិការណ៍នេះនឹងត្រឡប់ទៅអ្នកចាត់ចែងវិញ ដើម្បីកែប្រែ។'
              : 'The event goes back to the organiser to edit and resubmit.'}
        </p>
        <Field label={km ? 'ហេតុផល' : 'Reason'}>
          <textarea
            className="input"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              km
                ? 'ប្រាប់អ្នកចាត់ចែងឱ្យច្បាស់ថាត្រូវកែអ្វី។'
                : 'Tell the organiser exactly what to fix.'
            }
          />
        </Field>
        {!message.trim() && (
          <p className="small muted">
            {km ? 'ត្រូវការហេតុផល។' : 'A reason is required.'}
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}

/**
 * One labelled fact on a queue card.
 *
 * Defined at module scope, not inside the page component: a component created
 * during render is a new type on every render, so React unmounts and remounts
 * the whole subtree instead of updating it. That is the same lint error that
 * had main's build red earlier today, in MyBookingsPage.
 */
function Fact({ label, children }) {
  return (
    <span>
      <b style={{ fontWeight: 600 }}>{label}:</b> {children}
    </span>
  )
}

/** The API's typed error message when there is one, else a local fallback. */
function errorText(e, fallback) {
  const detail = e?.response?.data?.message || e?.response?.data?.error
  return detail ? `${fallback}: ${detail}` : fallback
}
