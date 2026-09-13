import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import QueueDialog from './QueueDialog.jsx'
import Icon from '../../components/Icon.jsx'
import { Alert, Empty, Field } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { RQ_CSS } from './queueStyles.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDateTime, timeAgo } from '../../lib/format.js'
import {
  approveApplication,
  getApplicationStatusCounts,
  getOrganizerApplications,
  rejectApplication,
} from '../../api/admin.js'

/*
 * Who wants to become an organiser - the other half of BecomeOrganizerPage.
 *
 * Built on the same split view as the review queue, and sharing its stylesheet,
 * because the two screens are the same job: read one submission, decide, move
 * to the next. An admin who has learned the event queue already knows this one.
 *
 * Two differences from that screen, both from the API:
 *
 *   - a plain array, no Page and so no pager. The endpoint takes no paging
 *     parameters; a queue this long is a backlog to work down, not to scroll.
 *   - no status filter. The endpoint serves PENDING only, so the dropdown the
 *     review queue carries would have exactly one option here.
 *
 * The rail mirrors the applicant's own form field for field, in the order they
 * filled it in. An admin deciding whether to trust someone with the power to
 * publish events and take money should be reading what that person actually
 * wrote, not a summary of it.
 */

// The three states an application can be in. Declaration order is the order it
// moves through them, so the tabs read as a path rather than an alphabet.
const QUEUES = ['PENDING', 'APPROVED', 'REJECTED']

const QUEUE_LABEL = {
  PENDING: { en: 'Pending', km: 'កំពុងរង់ចាំ' },
  APPROVED: { en: 'Approved', km: 'បានអនុម័ត' },
  REJECTED: { en: 'Rejected', km: 'បានបដិសេធ' },
}

/** Snake_case off the wire, camelCase if something ever maps it. As adapters.js. */
const pick = (o, snake, camel) => o?.[snake] ?? o?.[camel]

export default function AdminApplicationsPage() {
  const { locale } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(km ? 'ពាក្យសុំធ្វើជាអ្នករៀបចំ' : 'Organiser applications')
  const toast = useToast()

  const [status, setStatus] = useState('PENDING')
  const [counts, setCounts] = useState({})
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [version, setVersion] = useState(0)

  const [selectedId, setSelectedId] = useState(null)
  const [lastIndex, setLastIndex] = useState(0)
  // The detail opens as a dialog, as on the review queue. Closed until an
  // application is clicked - the list is what gets scanned.
  const [panelOpen, setPanelOpen] = useState(false)

  const [rejecting, setRejecting] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  /*
   * The effect only writes results. setLoading(true) in an effect body is a
   * synchronous setState during commit, which React flags as a cascading
   * render, so every entry point turns the flag on itself instead.
   */
  useEffect(() => {
    let live = true
    getOrganizerApplications({ status })
      .then((res) => {
        if (!live) return
        setLoadError(false)
        setRows(Array.isArray(res) ? res : [])
      })
      .catch(() => {
        if (!live) return
        setLoadError(true)
        setRows([])
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [status, version])

  /*
   * The tab counts, on the same thirty-second poll as the review queue's.
   * Applications arrive while an admin has this page open and there is no other
   * way for the client to hear about one.
   */
  useEffect(() => {
    let live = true
    const load = () => {
      getApplicationStatusCounts()
        .then((res) => live && setCounts(res || {}))
        .catch(() => {
          // The tabs show no number rather than an error - the queue still works.
        })
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [version])

  /*
   * Which row the rail shows - DERIVED, never stored in an effect.
   *
   * `selectedId` is what the admin clicked. It stops matching the moment a
   * decision lands, because a decided application is no longer PENDING and
   * drops out of the queue. Falling back to the same POSITION is what makes the
   * queue advance on its own: the index that row occupied now holds the next
   * one, so deciding repeatedly walks down the list without a click in between.
   */
  const selected = useMemo(() => {
    if (!rows.length) return null
    return rows.find((a) => a.id === selectedId) ?? rows[Math.min(lastIndex, rows.length - 1)]
  }, [rows, selectedId, lastIndex])

  /** Clicking an application opens it in the dialog. */
  const selectRow = (application, index) => {
    setSelectedId(application.id)
    setLastIndex(index)
    setPanelOpen(true)
  }

  const closePanel = () => setPanelOpen(false)

  const changeStatus = (next) => {
    setLoading(true)
    setStatus(next)
    setLastIndex(0)
    // A different status is a different set of rows; an open dialog would be
    // showing one that is no longer in the list.
    setSelectedId(null)
    setPanelOpen(false)
  }

  /*
   * Where the open application sits, and how to step past one without ruling on
   * it. Same reasoning as the review queue: the dialog already advanced after a
   * decision, but had no way to say where you were or to skip a hard case.
   */
  const selectedIndex = useMemo(
    () => (selected ? rows.findIndex((a) => a.id === selected.id) : -1),
    [rows, selected],
  )

  const step = (delta) => {
    const next = selectedIndex + delta
    if (next < 0 || next >= rows.length) return
    setSelectedId(rows[next].id)
    setLastIndex(next)
  }

  // Unpaged endpoint, so the index IS the position - no page offset to add.
  const position = selectedIndex < 0 ? null : selectedIndex + 1

  const refresh = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  async function approve() {
    if (!selected) return
    setBusy(true)
    try {
      await approveApplication(selected.id)
      toast(km ? 'បានអនុម័ត' : 'Approved', 'success')
      refresh()
    } catch (e) {
      toast(errorText(e, km ? 'អនុម័តមិនបានសម្រេច' : 'Could not approve'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submitRejection() {
    if (!selected || !message.trim()) return
    setBusy(true)
    try {
      await rejectApplication(selected.id, message.trim())
      toast(km ? 'បានបដិសេធ' : 'Rejected', 'success')
      setRejecting(false)
      setMessage('')
      refresh()
    } catch (e) {
      toast(errorText(e, km ? 'មិនបានសម្រេច' : 'Could not save decision'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rq-wrap">
      <style>{RQ_CSS}</style>

      <div className="rq-head">
        <div>
          <h1>{km ? 'ពាក្យសុំធ្វើជាអ្នករៀបចំ' : 'Organiser applications'}</h1>
          <p className="muted small">
            {km
              ? 'អ្នកប្រើប្រាស់ដែលកំពុងរង់ចាំការអនុញ្ញាតឱ្យរៀបចំព្រឹត្តិការណ៍ ដោយរៀបតាមលំដាប់ដាក់ស្នើមុនគេ។'
              : 'People waiting for permission to run events, oldest application first.'}
          </p>
        </div>
        {/* Tabs, as on the review queue. The count used to be a single number
            for the only status this screen could show; now the other two are
            reachable, and an admin who has just rejected somebody can look back
            at what they wrote without leaving the page. */}
        <div className="rq-head-right">
          <div className="rq-tabs" role="tablist" aria-label={km ? 'ស្ថានភាព' : 'Status'}>
            {QUEUES.map((q) => (
              <button
                key={q}
                type="button"
                role="tab"
                aria-selected={status === q}
                className={`rq-tab${status === q ? ' on' : ''}`}
                onClick={() => changeStatus(q)}
              >
                {km ? QUEUE_LABEL[q].km : QUEUE_LABEL[q].en}
                {counts[q] !== undefined && <span className="rq-tab-n">{counts[q]}</span>}
              </button>
            ))}
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
        <Empty icon="checkCircle" title={km ? 'គ្មានពាក្យសុំទេ' : 'No applications waiting'}>
          {km
            ? 'ជួរនេះទទេ។ ពាក្យសុំនឹងបង្ហាញនៅទីនេះ នៅពេលមានអ្នកដាក់ស្នើ។'
            : 'The queue is empty. Applications appear here when someone applies.'}
        </Empty>
      )}

      {rows.length > 0 && (
        <div className="rq-split">
          <div className="rq-col">
            <div className="rq-tablewrap">
              <table className="rq-queue">
                <thead>
                  <tr>
                    {/* Organisation first, applicant second: the admin is
                        deciding whether to trust an organisation to sell
                        tickets, and the person is how they are contacted about
                        it. No Status column - every row here is PENDING. */}
                    <th>{km ? 'អង្គភាព' : 'Organisation'}</th>
                    <th>{km ? 'អ្នកដាក់ស្នើ' : 'Applicant'}</th>
                    <th>{km ? 'ប្រភេទព្រឹត្តិការណ៍' : 'Event types'}</th>
                    <th className="rq-num">{km ? 'រង់ចាំ' : 'Waiting'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((application, i) => {
                    const nameEn = pick(application, 'org_name_en', 'orgNameEn')
                    const nameKm = pick(application, 'org_name_km', 'orgNameKm')
                    const submittedAt = pick(application, 'submitted_at', 'submittedAt')
                    const on = application.id === selected?.id
                    return (
                      <tr
                        key={application.id}
                        className={`rq-qrow${on ? ' is-on' : ''}`}
                        aria-selected={on}
                        tabIndex={0}
                        onClick={() => selectRow(application, i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            selectRow(application, i)
                          }
                        }}
                      >
                        <td>
                          <div className="rq-qtitle">{nameEn}</div>
                          {nameKm && <div className="km rq-qsub">{nameKm}</div>}
                        </td>
                        <td className="rq-qmuted">
                          {pick(application, 'applicant_name', 'applicantName') ?? '—'}
                        </td>
                        <td className="rq-qmuted">
                          {pick(application, 'event_types', 'eventTypes') ?? '—'}
                        </td>
                        <td className="rq-num rq-qmuted">
                          {submittedAt ? timeAgo(submittedAt).replace(' ago', '') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* The application, as a dialog - the same move the review queue made, and
          for the same reason: the rail cost the list half its width the whole
          time it was open, and the list is what gets scanned. */}
      {selected && panelOpen && selectedId && (
        <QueueDialog
          km={km}
          onClose={closePanel}
          label={km ? 'ព័ត៌មានលម្អិត' : 'Application detail'}
          position={position}
          total={rows.length}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < rows.length - 1}
        >
          <ApplicationPanel
            key={selected.id}
            application={selected}
            km={km}
            locale={locale}
            busy={busy}
            onApprove={approve}
            onReject={() => {
              setMessage('')
              setRejecting(true)
            }}
          />
        </QueueDialog>
      )}

      {/* A rejection needs a reason: the server refuses a blank one twice over,
          and "no" on its own is not something an applicant can act on. */}
      <ConfirmDialog
        open={rejecting}
        tone="danger"
        busy={busy}
        title={km ? 'បដិសេធពាក្យសុំនេះ?' : 'Reject this application?'}
        confirmLabel={km ? 'បដិសេធ' : 'Reject'}
        onConfirm={submitRejection}
        onClose={() => {
          setRejecting(false)
          setMessage('')
        }}
      >
        <p className="small muted">
          {km
            ? 'អ្នកដាក់ស្នើនឹងឃើញហេតុផលនេះ ហើយអាចដាក់ស្នើពាក្យសុំថ្មីម្តងទៀតបាន។'
            : 'The applicant sees this reason, and may submit a fresh application afterwards.'}
        </p>
        <Field label={km ? 'ហេតុផល' : 'Reason'}>
          <textarea
            className="input"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              km ? 'ប្រាប់ឱ្យច្បាស់ថាខ្វះអ្វី។' : 'Say exactly what was missing.'
            }
          />
        </Field>
        {!message.trim() && (
          <p className="small muted">{km ? 'ត្រូវការហេតុផល។' : 'A reason is required.'}</p>
        )}
      </ConfirmDialog>
    </div>
  )
}

/**
 * Everything the applicant submitted, in the order their own form asks for it.
 *
 * Module scope, not nested in the page: a component defined during render is a
 * new type every render, so React remounts the subtree instead of updating it.
 */
function ApplicationPanel({ application, km, locale, busy, onApprove, onReject }) {
  /*
   * Back to the top when the selection changes, or the rail opens partway down
   * the previous applicant's note rather than at the organisation's name.
   */
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [application.id])

  const nameEn = pick(application, 'org_name_en', 'orgNameEn')
  const nameKm = pick(application, 'org_name_km', 'orgNameKm')
  const telegram = pick(application, 'telegram_handle', 'telegramHandle')
  const facebook = pick(application, 'facebook_url', 'facebookUrl')
  const eventTypes = pick(application, 'event_types', 'eventTypes')
  const submittedAt = pick(application, 'submitted_at', 'submittedAt')

  /*
   * Neither contact field is required by the form, so an application can arrive
   * with no way to reach the applicant outside the platform. That is worth
   * saying out loud rather than leaving as two dashes the admin has to notice.
   */
  const noContact = !telegram && !facebook

  /*
   * Only a PENDING application can still be decided.
   *
   * This screen served PENDING and nothing else until the status tabs landed,
   * so the panel could assume every row it was handed was still open and put
   * Approve and Reject at the foot unconditionally. Now that decided rows are
   * reachable, that assumption shows an approved application with a live
   * Approve button on it - a control the server answers
   * ORGANIZER_APPLICATION_ALREADY_DECIDED to, and which makes a settled
   * decision look unsettled.
   */
  const decided = application.status && application.status !== 'PENDING'
  const adminNote = pick(application, 'admin_note', 'adminNote')
  const reviewedBy = pick(application, 'reviewed_by_name', 'reviewedByName')
  const reviewedAt = pick(application, 'reviewed_at', 'reviewedAt')

  return (
    <section className="rq-panel" aria-label={km ? 'ព័ត៌មានលម្អិត' : 'Application detail'}>
      <div className="rq-panel-scroll" ref={scrollRef}>
        <div className="rq-panel-head">
          <div>
            <h2>{nameEn}</h2>
            {nameKm && <div className="km-title km">{nameKm}</div>}
          </div>
        </div>

        {noContact && (
          <Alert tone="warn" title={km ? 'គ្មានមធ្យោបាយទំនាក់ទំនង' : 'No contact details'}>
            <span className="small">
              {km
                ? 'អ្នកដាក់ស្នើមិនបានផ្តល់តេឡេក្រាម ឬហ្វេសប៊ុកទេ។'
                : 'This applicant gave neither a Telegram handle nor a Facebook page.'}
            </span>
          </Alert>
        )}

        <div className="rq-section">
          <Row label={km ? 'អ្នកដាក់ស្នើ' : 'Applicant'}>
            {pick(application, 'applicant_name', 'applicantName') ?? '—'}
          </Row>
          <Row label={km ? 'លេខសម្គាល់អ្នកប្រើ' : 'User id'}>
            <span className="mono">{pick(application, 'user_id', 'userId')}</span>
          </Row>
          <Row label={km ? 'ដាក់ស្នើនៅ' : 'Submitted'}>{fmt(submittedAt, locale)}</Row>
        </div>

        <Section title={km ? 'ទំនាក់ទំនង' : 'Contact'}>
          <Row label="Telegram">
            {telegram ? <span className="mono">{telegram}</span> : '—'}
          </Row>
          <Row label="Facebook">
            {facebook ? (
              /* noreferrer as well as noopener: this URL was typed by the
                 person being reviewed, and an admin session is not a referrer
                 worth handing to a stranger's site. */
              <a href={facebook} target="_blank" rel="noopener noreferrer">
                {km ? 'បើកទំព័រ' : 'Open page'}
              </a>
            ) : (
              '—'
            )}
          </Row>
        </Section>

        <Section title={km ? 'អ្វីដែលពួកគេចង់រៀបចំ' : 'What they want to run'}>
          <p className="rq-desc">{eventTypes || (km ? 'មិនបានបញ្ជាក់' : 'Not specified')}</p>
        </Section>

        {application.message && (
          <Section title={km ? 'សារពីអ្នកដាក់ស្នើ' : 'Their note to you'}>
            <p className="rq-desc">{application.message}</p>
          </Section>
        )}
      </div>

      {/*
        * Two actions, not three. An application is decided once - there is no
        * request-changes edge, because a rejected applicant submits a fresh row
        * rather than editing the one you turned down.
        */}
      {decided ? (
        /* What was decided, by whom and when - the questions someone opening a
           settled application actually has. The reason is shown for a rejection
           because that is what the applicant was told, and an admin looking
           back is usually checking exactly that. */
        <footer className="rq-decided">
          <div className="rq-decided-head">
            <Icon
              name={application.status === 'APPROVED' ? 'checkCircle' : 'xCircle'}
              size={15}
            />
            <span>
              {application.status === 'APPROVED'
                ? km ? 'បានអនុម័ត' : 'Approved'
                : km ? 'បានបដិសេធ' : 'Rejected'}
              {reviewedBy ? ` · ${reviewedBy}` : ''}
            </span>
          </div>
          {reviewedAt && (
            <div className="rq-decided-when">{formatDateTime(reviewedAt, locale)}</div>
          )}
          {adminNote && <p className="rq-decided-note">{adminNote}</p>}
        </footer>
      ) : (
        <footer className="rq-actions">
          <button className="rq-act rq-act-approve" disabled={busy} onClick={onApprove}>
            <Icon name="checkCircle" size={14} />
            {km ? 'អនុម័ត' : 'Approve'}
          </button>
          <button className="rq-act rq-act-reject" disabled={busy} onClick={onReject}>
            <Icon name="xCircle" size={14} />
            {km ? 'បដិសេធ' : 'Reject'}
          </button>
        </footer>
      )}
    </section>
  )
}

function Section({ title, children }) {
  return (
    <div className="rq-section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="rq-kv">
      <span className="muted small">{label}</span>
      <span>{children}</span>
    </div>
  )
}

const fmt = (iso, locale) => (iso ? formatDateTime(iso, locale) : '—')

/** The API's typed message when there is one, else a local fallback. */
function errorText(e, fallback) {
  const detail = e?.response?.data?.detail || e?.response?.data?.message
  return detail ? `${fallback}: ${detail}` : fallback
}
