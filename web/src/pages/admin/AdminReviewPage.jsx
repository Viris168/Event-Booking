import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import QueueDialog from './QueueDialog.jsx'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, Empty, Field, Pager } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { RQ_CSS } from './queueStyles.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatDateTime, timeAgo, usd } from '../../lib/format.js'
import {
  approveEvent,
  getEventStatusCounts,
  getReviewQueue,
  rejectEvent,
  requestEventChanges,
} from '../../api/admin.js'

/*
 * The moderation queue - a queue you work through, not a directory you browse.
 *
 * Split view on purpose. The list keeps your place; the panel carries enough
 * of the submission to decide without opening anything else. /admin/events is
 * the directory: every event, any status, searchable. This is the inbox.
 *
 * The panel mirrors the organiser's own form field for field. A reviewer who
 * has to guess what the organiser typed is not reviewing, and every field
 * below already arrives in the queue payload - no second request.
 */

// Only statuses that represent work or its immediate aftermath. DRAFT is the
// organiser's private workspace; PUBLISHED belongs in the directory.
const QUEUES = ['PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED']

const PAGE_SIZE = 20

/** Snake_case off the wire, camelCase if something ever maps it. As adapters.js. */
const pick = (o, snake, camel) => o?.[snake] ?? o?.[camel]

/**
 * Cheapest and dearest ticket, across both halves of the inventory split.
 *
 * Zones alone would under-report a SEATED or MIXED event by its entire seat
 * map - the trap EventMapper's own comment describes - so seat classes are
 * folded in. Null when nothing is priced yet, which the column renders as a
 * dash rather than as $0.00: an unpriced event and a free one are different
 * things, and only one of them is a reason to reject.
 */
function priceRange(event) {
  const all = [
    ...(event.zones ?? []),
    ...(pick(event, 'seat_classes', 'seatClasses') ?? []),
  ]
    .map((row) => pick(row, 'price_usd_cents', 'priceUsdCents'))
    .filter((n) => typeof n === 'number' && n > 0)
  if (!all.length) return null
  return { min: Math.min(...all), max: Math.max(...all) }
}

export default function AdminReviewPage() {
  // The locale context's `status` is a label formatter; the local `status` is
  // the selected queue. Renamed so the two cannot collide.
  const { t, locale, status: statusLabel } = useLocale()
  const km = locale === 'km'
  useDocumentTitle(km ? 'ជួរត្រួតពិនិត្យ' : 'Review queue')
  const toast = useToast()

  const [status, setStatus] = useState('PENDING_REVIEW')
  const [page, setPage] = useState(0) // 0-indexed, like Spring's Pageable
  const [data, setData] = useState({ content: [], totalPages: 0, totalElements: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [version, setVersion] = useState(0)

  // Which row the panel is showing. ONE selection model - no checkboxes.
  // Bulk-approving events you have not read is the opposite of reviewing.
  const [selectedId, setSelectedId] = useState(null)

  /*
   * How many sit in each queue, for the tabs.
   *
   * Its own request, not derived from the page being shown: the list only ever
   * holds one status, so the other three counts have nowhere else to come from.
   */
  const [counts, setCounts] = useState({})

  /*
   * Whether the detail panel is open. Closed until an event is clicked.
   *
   * It used to open on the first row automatically, which decided for the
   * reviewer which submission they were looking at before they had chosen one -
   * and spent half the width saying so. The queue opens as a full-width list
   * now, and clicking an event is what asks for its detail.
   */
  const [panelOpen, setPanelOpen] = useState(false)

  const [deciding, setDeciding] = useState(null) // { action } | null
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  /*
   * The effect only writes results. setLoading(true) in an effect body is a
   * synchronous setState during commit, which React flags as a cascading
   * render, so every entry point turns the flag on itself instead.
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

  /*
   * The counts, refreshed on every reload of the list AND on a timer.
   *
   * Thirty seconds, and polling rather than a live connection: this is a page
   * an admin leaves open while working, and the number that matters - how many
   * are waiting - changes when an organiser submits something, which is not an
   * event this client has any other way to hear about. A websocket for four
   * integers would be a lot of moving parts for a number that is allowed to be
   * half a minute stale.
   */
  useEffect(() => {
    let live = true
    const load = () => {
      getEventStatusCounts()
        .then((res) => live && setCounts(res || {}))
        .catch(() => {
          // The tabs fall back to showing no number rather than an error: the
          // queue itself still works, and a failed count is not worth a banner.
        })
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [version])

  const rows = data.content

  /*
   * Which row the panel shows - DERIVED, never stored in an effect.
   *
   * `selectedId` is what the reviewer clicked. It stops matching the moment a
   * decision lands, because the row leaves this status and drops out of the
   * list. Falling back to the same POSITION is what makes the queue advance on
   * its own: the index that row occupied now holds the next one, so approving
   * repeatedly walks down the queue without a click in between.
   *
   * Deriving rather than syncing in an effect is also what keeps this off the
   * cascading-render rule - there is no setState during commit to begin with.
   */
  const [lastIndex, setLastIndex] = useState(0)

  const selected = useMemo(() => {
    if (!rows.length) return null
    return (
      rows.find((e) => e.id === selectedId) ?? rows[Math.min(lastIndex, rows.length - 1)]
    )
  }, [rows, selectedId, lastIndex])

  /**
   * Clicking a row opens it in the panel; clicking the row that is already open
   * hides the panel and gives the table the full width.
   *
   * <p>The toggle is what makes the rail feel like part of the row rather than
   * a fixture beside it: the same click that asked for the detail puts it away.
   * The panel's own close button stays - it is the obvious control once your
   * eye is already over there, and reaching back to the list to dismiss what
   * you are reading is the long way round.
   */
  const closePanel = () => setPanelOpen(false)

  /*
   * Where the open submission sits, and how to step through without deciding.
   *
   * The dialog already advanced on its own after a decision - the approved row
   * leaves the list and the same index now holds the next one. What it had no
   * way to express was WHERE you were, or how to move on from something you did
   * not want to rule on yet: the only exits were a decision or closing. A queue
   * you cannot skip through is a queue that stalls on its first hard case.
   */
  const selectedIndex = useMemo(
    () => (selected ? rows.findIndex((r) => r.id === selected.id) : -1),
    [rows, selected],
  )

  const step = (delta) => {
    const next = selectedIndex + delta
    if (next < 0 || next >= rows.length) return
    setSelectedId(rows[next].id)
    setLastIndex(next)
  }

  // Counted across the whole queue, not the page: "3 of 24" is the number a
  // reviewer is actually working down. Page-relative would reset to 1 every
  // twenty and say nothing about how much is left.
  const position = selectedIndex < 0 ? null : page * PAGE_SIZE + selectedIndex + 1

  /** Clicking an event opens it in the dialog. */
  const selectRow = (event, index) => {
    setSelectedId(event.id)
    setLastIndex(index)
    setPanelOpen(true)
  }

  const changeStatus = (next) => {
    setLoading(true)
    setStatus(next)
    setPage(0)
    setLastIndex(0)
    // A different queue is a different set of submissions; carrying the open
    // panel across would leave it showing a row that is no longer in the list.
    setSelectedId(null)
    setPanelOpen(false)
  }

  /*
   * Paging resets the position to the top of the new page. Carrying lastIndex
   * across would open the panel partway down a page nobody has looked at yet,
   * which for a queue you work top-to-bottom is just a skipped submission.
   */
  const changePage = (next) => {
    setLoading(true)
    setPage(next)
    setLastIndex(0)
  }

  const refresh = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  async function approve() {
    if (!selected) return
    setBusy(true)
    try {
      await approveEvent(selected.id)
      toast(km ? 'បានអនុម័ត' : 'Approved', 'success')
      refresh()
    } catch (e) {
      toast(errorText(e, km ? 'អនុម័តមិនបានសម្រេច' : 'Could not approve'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submitDecision() {
    if (!selected || !deciding || !message.trim()) return
    setBusy(true)
    try {
      if (deciding.action === 'REJECT') {
        await rejectEvent(selected.id, message.trim())
        toast(km ? 'បានបដិសេធ' : 'Rejected', 'success')
      } else {
        await requestEventChanges(selected.id, message.trim())
        toast(km ? 'បានផ្ញើត្រឡប់ទៅអ្នករៀបចំ' : 'Sent back to the organiser', 'success')
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

  return (
    <div className="rq-wrap">
      <style>{RQ_CSS}</style>

      <div className="rq-head">
        <div>
          <h1>{km ? 'ជួរត្រួតពិនិត្យ' : 'Review queue'}</h1>
          <p className="muted small">
            {km
              ? 'ព្រឹត្តិការណ៍ដែលកំពុងរង់ចាំការសម្រេចចិត្ត ដោយរៀបតាមលំដាប់ដាក់ស្នើមុនគេ។'
              : 'Waiting on a decision, oldest submission first.'}
          </p>
        </div>
        {/* Was a <select>, which showed one count and hid the other three -
            so "2 remaining" was the whole picture a reviewer got, and finding
            out whether anything had been rejected meant changing the filter and
            changing it back. Four tabs, four counts, one click between them. */}
        <div className="rq-head-right">
          <div className="rq-tabs" role="tablist" aria-label={t('status')}>
            {QUEUES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                className={`rq-tab${status === s ? ' on' : ''}`}
                onClick={() => changeStatus(s)}
              >
                {statusLabel(s)}
                {/* Absent until the first count lands rather than showing 0 -
                    a zero that turns into a 3 reads as work appearing, which
                    on this page is a lie. */}
                {counts[s] !== undefined && (
                  <span className="rq-tab-n">{counts[s]}</span>
                )}
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
        <Empty icon="checkCircle" title={km ? 'គ្មានអ្វីត្រូវត្រួតពិនិត្យទេ' : 'Nothing to review'}>
          {km
            ? 'ជួរនេះទទេ។ ព្រឹត្តិការណ៍នឹងបង្ហាញនៅទីនេះ នៅពេលអ្នករៀបចំដាក់ស្នើ។'
            : 'The queue is empty. Submitted events appear here.'}
        </Empty>
      )}

      {rows.length > 0 && (
        <div className="rq-split">
          {/* ------------------------------------------- the queue, as a table */}
          <div className="rq-col">
            <div className="rq-tablewrap">
              <table className="rq-queue">
                <thead>
                  <tr>
                    <th>{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                    <th>{km ? 'ទីកន្លែង' : 'Venue'}</th>
                    {/* Not Status. Every row in a queue filtered to one status
                        carries that status, so the column would repeat the
                        dropdown above it on every line and tell the reviewer
                        nothing. When the event happens does inform the
                        decision - next week reads differently from next year. */}
                    <th>{km ? 'ចាប់ផ្តើម' : 'Starts'}</th>
                    {/* What makes a submission worth opening BEFORE opening it.
                        A 50,000-capacity show at a 200-seat hall, or a whole
                        event priced at nothing, is exactly what a reviewer is
                        looking for - and until now the only way to see either
                        was to open every row in turn. Both numbers already ride
                        along in the queue payload, so this costs no request. */}
                    <th className="rq-num">{km ? 'ចំណុះ' : 'Capacity'}</th>
                    <th className="rq-num">{km ? 'តម្លៃ' : 'Price'}</th>
                    <th className="rq-num">{km ? 'រង់ចាំ' : 'Waiting'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((event, i) => {
                    /*
                     * submitted_at is cleared when an event leaves the queue, so
                     * on any status but PENDING_REVIEW it is absent and "never
                     * submitted" would be a lie. Fall back to the decision time.
                     */
                    const submittedAt = pick(event, 'submitted_at', 'submittedAt')
                    const decided = pick(event, 'latest_review', 'latestReview')
                    const stamp = submittedAt ?? pick(decided ?? {}, 'created_at', 'createdAt')
                    const venue = event.venue
                    const venueName = venue
                      ? (km ? pick(venue, 'name_km', 'nameKm') : null) ||
                        pick(venue, 'name_en', 'nameEn')
                      : null
                    const on = event.id === selected?.id
                    return (
                      <tr
                        key={event.id}
                        className={`rq-qrow${on ? ' is-on' : ''}`}
                        aria-selected={on}
                        tabIndex={0}
                        onClick={() => selectRow(event, i)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            selectRow(event, i)
                          }
                        }}
                      >
                        <td>
                          <div className="rq-qtitle">{event.title_en}</div>
                          {event.title_km && <div className="km rq-qsub">{event.title_km}</div>}
                        </td>
                        <td className="rq-qmuted">{venueName ?? '—'}</td>
                        <td className="rq-qmuted">
                          {event.starts_at ? formatDate(event.starts_at, locale) : '—'}
                        </td>
                        {/* "ago" is dropped: the column is headed Waiting, and
                            repeating the unit on every row is the sort of noise
                            that makes a table feel machine-filled. */}
                        <td className="rq-num rq-qmuted">
                          {(pick(event, 'total_capacity', 'totalCapacity') ?? 0).toLocaleString()}
                        </td>
                        <td className="rq-num rq-qmuted">
                          {(() => {
                            const p = priceRange(event)
                            // A dash, not $0.00: an unpriced event and a free
                            // one are different, and only one is a red flag.
                            if (!p) return '—'
                            return p.min === p.max ? usd(p.min) : `${usd(p.min)}–${usd(p.max)}`
                          })()}
                        </td>
                        <td className="rq-num rq-qmuted">
                          {stamp ? timeAgo(stamp).replace(' ago', '') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pager counts from 1; Spring's Pageable counts from 0. Without
                this the 21st submission is unreachable. */}
            {data.totalPages > 1 && (
              <Pager
                page={page + 1}
                pages={data.totalPages}
                onChange={(n) => changePage(n - 1)}
              />
            )}
          </div>

        </div>
      )}

      {/* Both REJECT and REQUEST_CHANGES need a reason - the server refuses a
          blank one, and the organiser cannot act on "no". */}
      {/*
        * The submission, as a dialog.
        *
        * It was a rail pinned to the right of the list, which cost the table
        * half its width the whole time it was open - and the list is what a
        * reviewer scans. A dialog gives the detail the room it needs only while
        * it is being read, and hands the full width back the moment it closes.
        *
        * Below the decision dialog in the stack: Approve and Reject open their
        * own confirmation ON TOP of this one, so this sits at 1050 against
        * .confirm-overlay's 1100.
        */}
      {selected && panelOpen && selectedId && (
        <QueueDialog
          km={km}
          onClose={closePanel}
          label={km ? 'ព័ត៌មានលម្អិត' : 'Submission detail'}
          position={position}
          total={data.totalElements}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < rows.length - 1}
        >
          {/* Keyed on the event so React REMOUNTS the panel when the queue
              advances under it. Two reasons: the scroll position resets, so the
              next submission starts at the top rather than halfway down where
              the last one was left - and the swap animation re-runs, which is
              what makes a silent content change register. */}
          <EventReviewPanel
            key={selected.id}
            event={selected}
            km={km}
            locale={locale}
            busy={busy}
            onApprove={approve}
            onRequestChanges={() => {
              setMessage('')
              setDeciding({ action: 'REQUEST_CHANGES' })
            }}
            onReject={() => {
              setMessage('')
              setDeciding({ action: 'REJECT' })
            }}
          />
        </QueueDialog>
      )}

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
              ? 'ផ្ញើត្រឡប់ដើម្បីកែប្រែ?'
              : 'Send back for changes?'
        }
        confirmLabel={
          deciding?.action === 'REJECT' ? (km ? 'បដិសេធ' : 'Reject') : km ? 'ផ្ញើ' : 'Send back'
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
              ? 'ការបដិសេធគឺជាចុងក្រោយ។ អ្នករៀបចំមិនអាចដាក់ស្នើវាឡើងវិញបានទេ។'
              : 'Rejection is final. The organiser cannot resubmit this event.'
            : km
              ? 'អ្នករៀបចំនឹងអាចកែប្រែ និងដាក់ស្នើឡើងវិញ។'
              : 'The organiser can edit it and submit again.'}
        </p>
        {/* The reason below only reaches the organiser once they reopen the
            form - these open a direct chat now, on whichever contact they
            gave when they applied. */}
        {selected && <ContactButtons event={selected} km={km} />}
        <Field label={km ? 'ហេតុផល' : 'Reason'}>
          <textarea
            className="input"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              km ? 'ប្រាប់ឱ្យច្បាស់ថាត្រូវកែអ្វី។' : 'Say exactly what needs to change.'
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
 * Everything the organiser submitted, in the order their own form asks for it.
 *
 * Module scope, not nested in the page: a component defined during render is a
 * new type every render, so React remounts the subtree instead of updating it.
 */
function EventReviewPanel({ event, km, locale, busy, onApprove, onRequestChanges, onReject }) {
  /*
   * Back to the top when the selection changes.
   *
   * Without this the pane keeps the scroll offset of the submission you just
   * finished reading, so the next one opens partway down - at "Inventory mode"
   * rather than at its title. Scrolling an element is a DOM effect, not state,
   * so there is no render cascade to avoid here.
   */
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [event.id])

  const actions = pick(event, 'available_actions', 'availableActions') ?? []
  const latest = pick(event, 'latest_review', 'latestReview')
  const venue = event.venue
  const cover = pick(event, 'cover_image_url', 'coverImageUrl')
  const banner = pick(event, 'banner_image_url', 'bannerImageUrl')
  const seatClasses = pick(event, 'seat_classes', 'seatClasses') ?? []
  const zones = event.zones ?? []
  const capacity = pick(event, 'total_capacity', 'totalCapacity') ?? 0

  const venueName = venue
    ? (km ? pick(venue, 'name_km', 'nameKm') : null) || pick(venue, 'name_en', 'nameEn')
    : null

  return (
    <section className="rq-panel" aria-label={km ? 'ព័ត៌មានលម្អិត' : 'Submission detail'}>
      <div className="rq-panel-scroll" ref={scrollRef}>
        {banner ? (
          <img className="rq-cover" src={banner} alt="" />
        ) : (
          <div className="rq-cover rq-cover-empty">
            <Icon name="alert" size={16} />
            <span className="small">{km ? 'គ្មានរូបភាពបដា' : 'No banner image'}</span>
          </div>
        )}

        <div className="rq-panel-head">
          <div>
            <h2>{event.title_en}</h2>
            {event.title_km && <div className="km-title km">{event.title_km}</div>}
          </div>
          <Badge status={event.status} />
        </div>

        {/* Why it is back, when it is back. The organiser already fixed
            something - say what was asked for, or the reviewer re-reads the
            whole event to remember. */}
        {latest?.message && (
          <Alert
            tone="info"
            title={`${latest.action} · ${pick(latest, 'actor_name', 'actorName') ?? ''}`}
          >
            <span className="small">{latest.message}</span>
          </Alert>
        )}

        {capacity === 0 && (
          <Alert tone="warn" title={km ? 'គ្មានសំបុត្រលក់' : 'Nothing on sale'}>
            <span className="small">
              {km
                ? 'ព្រឹត្តិការណ៍នេះគ្មានកៅអី ឬតំបន់ណាមួយទេ។'
                : 'This event has no seat classes or zones.'}
            </span>
          </Alert>
        )}

        <div className="rq-section">
          <Row label={km ? 'ទីកន្លែង' : 'Venue'}>{venueName ?? '—'}</Row>
          <Row label={km ? 'ប្រភេទ' : 'Category'}>{event.category ?? '—'}</Row>
          <Row label={km ? 'របៀបសំបុត្រ' : 'Inventory mode'}>
            {pick(event, 'inventory_mode', 'inventoryMode') ?? '—'}
          </Row>
          <Row label="Slug">
            <span className="mono">{event.slug}</span>
          </Row>
        </div>

        {/* Straight to a DM, not just a note in the review record. A reason
            left here reaches the organiser only once they reopen the form -
            these open the same Telegram/Facebook they gave when they applied
            to become an organiser, so a reviewer can actually talk to them. */}
        <ContactButtons event={event} km={km} />

        <Section title={km ? 'កាលវិភាគ' : 'Schedule'}>
          <Row label={km ? 'ចាប់ផ្តើម' : 'Starts'}>{fmt(event.starts_at, locale)}</Row>
          <Row label={km ? 'បើកទ្វារ' : 'Doors open'}>{fmt(event.doors_open_at, locale)}</Row>
          <Row label={km ? 'បើកការលក់' : 'Sales open'}>{fmt(event.sales_open_at, locale)}</Row>
          <Row label={km ? 'បិទការលក់' : 'Sales close'}>{fmt(event.sales_close_at, locale)}</Row>
        </Section>

        <Section title={km ? 'ការពិពណ៌នា' : 'Description'}>
          <p className="rq-desc">
            {event.description_en || <em className="muted">{km ? 'គ្មាន' : 'none'}</em>}
          </p>
          {event.description_km && <p className="rq-desc km">{event.description_km}</p>}
        </Section>

        {seatClasses.length > 0 && (
          <Section title={km ? 'ថ្នាក់កៅអី' : 'Seat classes'}>
            <table className="rq-table">
              <tbody>
                {seatClasses.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {pick(c, 'name_en', 'nameEn')}
                      {pick(c, 'name_km', 'nameKm') && (
                        <div className="km small muted">{pick(c, 'name_km', 'nameKm')}</div>
                      )}
                    </td>
                    <td className="rq-num">{pick(c, 'seat_count', 'seatCount') ?? 0} seats</td>
                    <td className="rq-num">
                      {usd(pick(c, 'price_usd_cents', 'priceUsdCents') ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {zones.length > 0 && (
          <Section title={km ? 'តំបន់' : 'Zones'}>
            <table className="rq-table">
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>
                      {pick(z, 'name_en', 'nameEn')}
                      {pick(z, 'name_km', 'nameKm') && (
                        <div className="km small muted">{pick(z, 'name_km', 'nameKm')}</div>
                      )}
                    </td>
                    <td className="rq-num">{z.capacity ?? 0} cap</td>
                    <td className="rq-num">
                      {usd(pick(z, 'price_usd_cents', 'priceUsdCents') ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {cover && (
          <Section title={km ? 'រូបភាពផែនទី' : 'Map image'}>
            <img className="rq-banner" src={cover} alt="" />
          </Section>
        )}
      </div>

      {/*
        * Pinned, as in the reference: a reviewer who has scrolled a long
        * submission should not scroll back up to act on it. The reference puts
        * its order total here; the equivalent for an event is what it is
        * putting on sale.
        */}
      <footer className="rq-actions">
        <div className="rq-total">
          <span>{km ? 'ចំណុះសរុប' : 'Total capacity'}</span>
          <b>{capacity.toLocaleString()}</b>
        </div>

        {actions.length === 0 ? (
          <span className="rq-qmuted">{km ? 'គ្មានសកម្មភាព' : 'No actions available'}</span>
        ) : (
          <>
            {actions.includes('APPROVE') && (
              <button className="rq-act rq-act-approve" disabled={busy} onClick={onApprove}>
                <Icon name="check" size={15} />
                {km ? 'អនុម័ត' : 'Approve'}
              </button>
            )}
            {/* Two-up beneath, the way the reference pairs its actions. Reject
                is the quietest of the three on purpose - it is the only one
                that cannot be walked back. */}
            <div className="rq-actpair">
              {actions.includes('REQUEST_CHANGES') && (
                <button className="rq-act rq-act-changes" disabled={busy} onClick={onRequestChanges}>
                  <Icon name="edit" size={14} />
                  {km ? 'កែប្រែ' : 'Changes'}
                </button>
              )}
              {actions.includes('REJECT') && (
                <button className="rq-act rq-act-reject" disabled={busy} onClick={onReject}>
                  <Icon name="xCircle" size={14} />
                  {km ? 'បដិសេធ' : 'Reject'}
                </button>
              )}
            </div>
          </>
        )}
      </footer>
    </section>
  )
}

/** @sokha or plain "sokha" both arrive from the applicant's own typing. */
const telegramUrl = (handle) => `https://t.me/${handle.replace(/^@/, '').trim()}`

/**
 * Message the organiser directly, on whichever of Telegram or Facebook they
 * gave when they applied - the server only sends these two fields for
 * Audience.ADMIN, so an organiser never sees a link back to themselves here.
 */
function ContactButtons({ event, km }) {
  const telegram = pick(event, 'organizer_telegram_handle', 'organizerTelegramHandle')
  const facebook = pick(event, 'organizer_facebook_url', 'organizerFacebookUrl')
  if (!telegram && !facebook) return null

  return (
    <div className="rq-contact-btns">
      {telegram && (
        <a
          className="btn btn-sm contact-btn-telegram"
          href={telegramUrl(telegram)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="external" size={14} />
          {km ? 'ទាក់ទងតាម Telegram' : 'Message on Telegram'}
        </a>
      )}
      {facebook && (
        /* noreferrer as well as noopener: this URL was typed by the organiser
           being reviewed, not chosen by the platform. */
        <a className="btn btn-sm contact-btn-facebook" href={facebook} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={14} />
          {km ? 'ទាក់ទងតាម Facebook' : 'Message on Facebook'}
        </a>
      )}
    </div>
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

/*
 * Date AND time, not just the date.
 *
 * Doors-open and starts-at are almost always the same calendar day, so a
 * date-only render shows two identical strings and hides the one thing the
 * reviewer is checking - the gap between them. "Doors must open 90 minutes
 * before the show" is not a decision you can make from "Sun, 14 Mar 2027"
 * twice.
 */
const fmt = (iso, locale) => (iso ? formatDateTime(iso, locale) : '—')

/** The API's typed message when there is one, else a local fallback. */
function errorText(e, fallback) {
  const detail = e?.response?.data?.detail || e?.response?.data?.message
  return detail ? `${fallback}: ${detail}` : fallback
}
