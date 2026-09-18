import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import {
  ActiveFilters,
  Alert,
  Badge,
  Empty,
  Field,
  IconSelect,
  ResponsiveTable,
  TablePager,
} from '../../components/ui.jsx'
import { TableSkeleton } from '../../components/Skeleton.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { timeAgo, usd } from '../../lib/format.js'
import { downloadCsv, stampedFilename, toCsv } from '../../lib/csv.js'
import { usePaging } from '../../lib/usePaging.js'
import {
  getEventsOverview,
  getPaymentHealthByEvent,
  getPayments,
  reconcilePayment,
} from '../../api/admin.js'

/*
 * The provider's name as a person says it, in one place.
 *
 * It used to be written inline in the table body while the filter dropdown
 * beside it offered the raw enum - so the control said BAKONG_KHQR and the row
 * it filtered said "Bakong KHQR", which reads as two different things.
 */
const PROVIDER_LABEL = {
  BAKONG_KHQR: 'Bakong KHQR',
  ABA_PAYWAY: 'ABA PayWay',
}
const PROVIDERS = Object.keys(PROVIDER_LABEL)
const STATUSES = ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED']

/*
 * The two the provider can still be asked about - PaymentStatus.isOpen() on the
 * server, which is the authority. Restated here only to decide whether to draw
 * a button; the server refuses a pointless check regardless of what this says.
 */
const OPEN_STATUSES = ['CREATED', 'PENDING']

/*
 * "Needs reconciliation" is not a status on payment_transaction - it is open
 * for longer than an hour, which is a comparison against the clock the server
 * makes. It sits in the status dropdown anyway, for the same reason FINISHED
 * sits in the moderation table's status filter: the person using it is asking
 * one question - "show me these ones" - and giving a derived answer its own
 * bespoke control is how this screen ended up with a chip button wedged
 * between two selects, renaming itself depending on which way it was set.
 *
 * It stays a separate parameter on the wire (stuckOnly), because the server
 * answers it from a clock rather than from a column.
 */
const STUCK_OPTION = 'NEEDS_RECONCILIATION'

/*
 * The screen has two views and one piece of state deciding between them.
 *
 * With no event chosen it lists EVENTS - every one that has ever taken a
 * payment, worst failure rate first. Choosing one drills into that event's
 * attempts. A flat list of every attempt on the platform was the old default,
 * and at 1,300 rows it answered no question anybody actually arrives with:
 * "how is this event collecting" and "why has this booking not paid" are both
 * questions about one event.
 *
 * The filters are the exception. A link from the dashboard carrying ?stuck=1 is
 * asking across every event at once, so any active filter drops straight to the
 * attempts view - see `browsingEvents`.
 */

export default function AdminPaymentsPage() {
  const { t, locale, dateTime, status: statusLabel } = useLocale()
  useDocumentTitle(t('payments'))
  const [params] = useSearchParams()
  const toast = useToast()

  const [provider, setProvider] = useState('')
  const [status, setStatus] = useState('')
  const [eventId, setEventId] = useState('')
  const [stuckOnly, setStuckOnly] = useState(params.get('stuck') === '1')

  /*
   * Payment attempts, from payment_transaction via /admin/payments.
   *
   * Filtering is the server's: "stuck" in particular is a comparison against
   * the clock, and a tab left open overnight would answer it from whenever it
   * last rendered. Provider and status go the same way so the three controls
   * behave alike.
   */
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [paymentsError, setPaymentsError] = useState(false)
  const [paymentsVersion, setPaymentsVersion] = useState(0)

  useEffect(() => {
    let live = true
    getPayments({
      ...(provider ? { provider } : {}),
      ...(status ? { status } : {}),
      ...(eventId ? { eventId } : {}),
      ...(stuckOnly ? { stuckOnly: true } : {}),
    })
      .then((res) => {
        if (!live) return
        setPaymentsError(false)
        setPayments(Array.isArray(res) ? res : [])
      })
      .catch(() => {
        if (!live) return
        setPaymentsError(true)
        setPayments([])
      })
      .finally(() => live && setLoadingPayments(false))
    return () => {
      live = false
    }
  }, [provider, status, eventId, stuckOnly, paymentsVersion])

  /*
   * The event dropdown, and the health panel behind it.
   *
   * Both load once and neither depends on the filters - the health figures in
   * particular are a comparison ACROSS events, so recomputing them every time
   * somebody narrows the table would be both wasteful and wrong: the panel is
   * what tells you which event to filter to.
   */
  const [events, setEvents] = useState([])
  const [health, setHealth] = useState([])
  // Which row is mid-check. One at a time: the button is per row, and a second
  // click on the same attempt would ask a provider that has just been asked.
  const [checkingId, setCheckingId] = useState(null)

  useEffect(() => {
    let live = true
    Promise.all([getEventsOverview(), getPaymentHealthByEvent()])
      .then(([list, rows]) => {
        if (!live) return
        setEvents(Array.isArray(list) ? list : [])
        setHealth(Array.isArray(rows) ? rows : [])
      })
      // The table below reports a failure of its own; a missing dropdown or a
      // missing panel is not worth a second red banner saying the same thing.
      .catch(() => {
        if (!live) return
        setEvents([])
        setHealth([])
      })
    return () => {
      live = false
    }
  }, [])

  const km = locale === 'km'

  /*
   * The select shows one value; behind it the stuck filter and the status
   * filter stay separate, because they are separate questions to the server.
   * They are mutually exclusive by construction here - asking for EXPIRED and
   * for still-open-too-long at once returns nothing, every time.
   */
  const statusValue = stuckOnly ? STUCK_OPTION : status
  function changeStatus(next) {
    setStuckOnly(next === STUCK_OPTION)
    setStatus(next === STUCK_OPTION ? '' : next)
  }
  const eventTitle = (e) => (km ? e.title_km : e.title_en)

  /*
   * The chosen event, from the dropdown's list or - failing that - from the
   * health rows, which carry the same two titles. Either list alone can come
   * back empty on a bad request, and the heading falling back to "Attempts"
   * while the reader is plainly inside one event is a worse answer than the
   * title the other list already has.
   */
  const selectedEvent =
    events.find((e) => String(e.id) === String(eventId)) ??
    health.find((h) => String(h.event_id) === String(eventId))

  const chips = [
    provider && {
      key: 'provider',
      icon: 'card',
      label: PROVIDER_LABEL[provider] ?? provider,
      onRemove: () => setProvider(''),
    },
    status && {
      key: 'status',
      icon: 'filter',
      label: statusLabel(status),
      onRemove: () => setStatus(''),
    },
    eventId && {
      key: 'event',
      icon: 'calendar',
      // The title if the dropdown has loaded, the id if it has not - a chip
      // that renders blank leaves a filter on with nothing saying so.
      label: selectedEvent ? eventTitle(selectedEvent) : `#${eventId}`,
      onRemove: () => setEventId(''),
    },
    stuckOnly && {
      key: 'stuck',
      icon: 'alert',
      // The same words the dropdown offers. It read "Stuck only" while the
      // control that set it said "Needs reconciliation".
      label: t('reconciliation'),
      onRemove: () => setStuckOnly(false),
    },
  ].filter(Boolean)

  function clearAll() {
    setProvider('')
    setStatus('')
    setEventId('')
    setStuckOnly(false)
  }

  /*
   * The file is the view on screen: these are the rows the filters just
   * produced, in the order they are displayed, so the download and the table
   * cannot disagree.
   *
   * Timestamps go out as ISO rather than as "3d ago" - a spreadsheet can sort
   * and subtract one of those, and the whole point of the export is to line it
   * up against a provider statement. Both amounts go too: the USD figure is
   * what the platform records, while a Bakong settlement is listed in KHR, and
   * whoever is reconciling needs whichever one their statement speaks.
   */
  function exportCsv() {
    const columns = [
      { header: 'Provider', value: (p) => PROVIDER_LABEL[p.provider] ?? p.provider },
      { header: 'Provider ref', value: (p) => p.provider_ref },
      { header: 'Booking ref', value: (p) => p.booking_ref },
      { header: 'Booking state', value: (p) => p.booking_state },
      { header: 'Event', value: (p) => p.event_title_en },
      { header: 'Buyer', value: (p) => p.buyer_name },
      { header: 'Status', value: (p) => p.status },
      { header: 'Amount USD', value: (p) => (p.amount_usd_cents ?? 0) / 100 },
      { header: 'Amount KHR', value: (p) => p.amount_khr ?? '' },
      { header: 'Charged in', value: (p) => p.currency_charged },
      { header: 'Created', value: (p) => p.created_at },
      { header: 'Resolved', value: (p) => p.resolved_at ?? '' },
      { header: 'Needs reconciliation', value: (p) => (p.stuck ? 'yes' : 'no') },
    ]
    /*
     * Named after the event when there is one, so a folder of these is
     * readable six months later - "bassac-jazz-night-2026-09-16.csv" rather
     * than four files called payments.csv with browser suffixes.
     *
     * The English title, transliteration-free: a Khmer filename survives the
     * download fine but not every accounting tool it will be handed to.
     */
    const slug = selectedEvent?.title_en
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    downloadCsv(stampedFilename(slug || 'payments'), toCsv(columns, payments))
  }

  /*
   * Failures as a share of the attempts that FINISHED - in-flight ones are left
   * out on both sides, matching EventPaymentHealthResponse.failureRate() on the
   * server, which is what the rows are already sorted by. Two definitions of
   * this number would sort one way and read another.
   */
  const failureRate = (h) => {
    const finished = h.settled + h.failed
    return finished === 0 ? 0 : h.failed / finished
  }

  /*
   * Ask the provider about one attempt.
   *
   * The answer is a toast rather than a silent row update, because all three
   * outcomes are things the admin needs told: the payment settled, it is
   * genuinely still open at the provider, or it was not checked at all because
   * the rate floor says it is too soon. A row that quietly stayed the same
   * would read as a broken button in two of those three cases.
   */
  async function checkWithProvider(payment) {
    setCheckingId(payment.id)
    try {
      const result = await reconcilePayment(payment.id)
      if (!result.checked) {
        toast(
          km
            ? 'មិនទាន់អាចសួរម្ដងទៀតបានទេ។ សូមរង់ចាំមួយភ្លែត។'
            : 'Not checked — too soon to ask this provider again. Try shortly.',
          'info',
        )
      } else if (result.payment?.status === 'SUCCESS') {
        toast(km ? 'បានទទួលប្រាក់រួចរាល់' : 'Settled — the provider had the money', 'success')
      } else {
        toast(
          km
            ? `អ្នកផ្តល់សេវាឆ្លើយថា៖ ${result.payment?.status}`
            : `Checked — the provider still says ${result.payment?.status}`,
          'info',
        )
      }
      // Refetch rather than patching the row in place: settling an attempt also
      // moves its booking, and the stuck flag is computed against a clock that
      // has moved on too.
      setPaymentsVersion((v) => v + 1)
    } catch (e) {
      toast(
        e?.response?.data?.detail ||
          (km ? 'មិនអាចពិនិត្យបានទេ' : 'Could not reach the provider'),
        'error',
      )
    } finally {
      setCheckingId(null)
    }
  }

  /*
   * Which view is on screen. Not a tab: every one of these is a real narrowing
   * of the attempts table, and a tab would let the two disagree - "Events"
   * selected while a stuck filter quietly excluded most of them.
   */
  const browsingEvents = !eventId && !provider && !status && !stuckOnly

  /*
   * A pager each, because the two tables are two different lists - paging the
   * event directory has nothing to do with paging one event's attempts, and a
   * shared page number would carry "page 3" from one into the other and land
   * the reader past the end of it.
   *
   * Client-side: both lists are already in the browser, and the attempts one is
   * now scoped to a single event rather than to the whole platform.
   */
  const pagedEvents = usePaging(health, 'events')
  const pagedPayments = usePaging(payments, `${provider}|${status}|${eventId}|${stuckOnly}`)

  const totals = payments.reduce(
    (acc, p) => ({
      count: acc.count + 1,
      success: acc.success + (p.status === 'SUCCESS' ? p.amount_usd_cents : 0),
      pending: acc.pending + (['PENDING', 'CREATED'].includes(p.status) ? p.amount_usd_cents : 0),
    }),
    { count: 0, success: 0, pending: 0 },
  )

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          {/* The heading says which of the two things you are looking at, and
              the event's own title is the heading once you are inside one -
              "Payments" over a single event's attempts says the least useful
              true thing available. */}
          <h1>
            {browsingEvents
              ? t('payments')
              : selectedEvent
                ? eventTitle(selectedEvent)
                : km
                  ? 'ប្រតិបត្តិការ'
                  : 'Attempts'}
          </h1>
          <p>
            {browsingEvents ? (
              km
                ? 'ព្រឹត្តិការណ៍ដែលមានការទូទាត់ — ចុចដើម្បីមើលលម្អិត'
                : 'Every event that has taken a payment. Open one to see its attempts.'
            ) : (
              <>
                {/* Describes the filtered view, which is exactly what the
                    export contains - the two cannot disagree. */}
                {totals.count} {km ? 'ប្រតិបត្តិការ' : 'attempts'} · {usd(totals.success)}{' '}
                {km ? 'ជោគជ័យ' : 'settled'} · {usd(totals.pending)} {km ? 'រង់ចាំ' : 'in flight'}
              </>
            )}
          </p>
        </div>
        {!browsingEvents && (
          <div className="row row-tight">
            <button className="btn btn-ghost" onClick={clearAll}>
              <Icon name="arrowLeft" size={15} />
              {km ? 'ព្រឹត្តិការណ៍ទាំងអស់' : 'All events'}
            </button>
            <button
              className="btn btn-outline"
              onClick={exportCsv}
              disabled={payments.length === 0}
              title={km ? 'ទាញយកជា CSV' : 'Download these rows as CSV'}
            >
              <Icon name="external" size={15} />
              {km ? 'នាំចេញ CSV' : 'Export CSV'}
            </button>
          </div>
        )}
      </div>


      <div className="panel" style={{ marginBottom: '1.2rem' }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={km ? 'អ្នកផ្តល់សេវា' : 'Provider'}>
              <IconSelect
                icon="card"
                value={provider}
                onChange={setProvider}
                ariaLabel={km ? 'អ្នកផ្តល់សេវា' : 'Provider'}
              >
                <option value="">{km ? 'ទាំងអស់' : 'All providers'}</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={t('status')}>
              <IconSelect
                icon="filter"
                value={statusValue}
                onChange={changeStatus}
                ariaLabel={t('status')}
              >
                <option value="">{km ? 'ទាំងអស់' : 'All statuses'}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
                <option value={STUCK_OPTION}>{t('reconciliation')}</option>
              </IconSelect>
            </Field>
            <Field label={km ? 'ព្រឹត្តិការណ៍' : 'Event'}>
              <IconSelect
                icon="calendar"
                value={eventId}
                onChange={setEventId}
                ariaLabel={km ? 'ព្រឹត្តិការណ៍' : 'Event'}
              >
                <option value="">{km ? 'ព្រឹត្តិការណ៍ទាំងអស់' : 'All events'}</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {eventTitle(e)}
                  </option>
                ))}
              </IconSelect>
            </Field>
          </div>

          {chips.length > 0 && (
            <div style={{ marginTop: '0.85rem' }}>
              <ActiveFilters items={chips} onClearAll={clearAll} clearAllLabel={t('reset')} />
            </div>
          )}
        </div>
      </div>

      {/*
        * The event list - the screen's front door.
        *
        * Sorted worst failure rate first by the server, so whatever is broken
        * is the first row rather than something you have to go looking for.
        * Revenue cannot show this: an event that collects $500 on the third
        * attempt every time earns the same as one that collects it first time,
        * and only the attempt counts can tell them apart.
        */}
      {browsingEvents && (
        <div className="panel">
          <div className="panel-head">
            <h2>{km ? 'ព្រឹត្តិការណ៍' : 'Events'}</h2>
            <span className="small muted">
              {km ? 'អត្រាបរាជ័យខ្ពស់បំផុតមុនគេ' : 'Highest failure rate first'}
            </span>
          </div>
          {health.length === 0 ? (
            <div className="panel-body">
              <Empty icon="card" title={km ? 'គ្មានការទូទាត់ទេ' : 'No payments yet'}>
                {km
                  ? 'ការទូទាត់នឹងបង្ហាញនៅទីនេះ នៅពេលមានអ្នកទិញសំបុត្រ។'
                  : 'Attempts appear here as soon as somebody buys a ticket.'}
              </Empty>
            </div>
          ) : (
            <>
              <ResponsiveTable>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                      <th className="num">{km ? 'ព្យាយាម' : 'Attempts'}</th>
                      <th className="num">{km ? 'ជោគជ័យ' : 'Settled'}</th>
                      <th className="num">{km ? 'បរាជ័យ' : 'Failed'}</th>
                      <th className="num">{km ? 'អត្រាបរាជ័យ' : 'Failure rate'}</th>
                      {/* "Settled", never "revenue" - this is the money the
                          provider took, which is not the same question as what
                          the event earned. See the DTO. */}
                      <th className="num">{km ? 'ទឹកប្រាក់' : 'Settled value'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEvents.visible.map((h) => (
                      <tr
                        key={h.event_id}
                        className="row-clickable"
                        tabIndex={0}
                        onClick={() => setEventId(String(h.event_id))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setEventId(String(h.event_id))
                          }
                        }}
                      >
                        <td className="font-bold">{km ? h.title_km : h.title_en}</td>
                        <td className="num small muted">{h.attempts}</td>
                        <td className="num small">{h.settled}</td>
                        <td className="num small">{h.failed}</td>
                        {/* A third of finished attempts failing is where this
                            stops being customers changing their minds. */}
                        <td
                          className={`num font-bold ${failureRate(h) >= 0.33 ? 'text-danger' : ''}`}
                        >
                          {Math.round(failureRate(h) * 100)}%
                        </td>
                        <td className="num font-bold">{usd(h.settled_usd_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
              <TablePager
                page={pagedEvents.page}
                pages={pagedEvents.pageCount}
                pageSize={pagedEvents.pageSize}
                onPage={pagedEvents.setPage}
                onPageSize={pagedEvents.setPageSize}
              />
            </>
          )}
        </div>
      )}

      {paymentsError && (
        <Alert tone="danger" style={{ marginBottom: '1.2rem' }}>
          {km ? 'មិនអាចផ្ទុកការទូទាត់បានទេ។' : 'Could not load payments.'}{' '}
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setLoadingPayments(true)
              setPaymentsVersion((v) => v + 1)
            }}
          >
            {km ? 'ព្យាយាមម្ដងទៀត' : 'Try again'}
          </button>
        </Alert>
      )}

      {browsingEvents ? null : loadingPayments ? (
        <TableSkeleton rows={10} cols={8} />
      ) : payments.length === 0 && !paymentsError ? (
        <Empty
          icon={stuckOnly ? 'checkCircle' : 'search'}
          title={
            stuckOnly
              ? km
                ? 'គ្មានការទូទាត់ជាប់ទេ'
                : 'Nothing stuck'
              : km
                ? 'រកមិនឃើញការទូទាត់ទេ'
                : 'No payments match'
          }
        >
          {stuckOnly
            ? km
              ? 'រាល់ការទូទាត់ដែលកំពុងរង់ចាំនៅតែស្ថិតក្នុងកម្រិតធម្មតា។'
              : 'Every pending attempt is still inside the one-hour window.'
            : km
              ? 'សាកល្បងលុបតម្រងចេញ។'
              : 'Try clearing a filter.'}
          {chips.length > 0 && (
            <button className="btn btn-sm btn-outline" onClick={clearAll} style={{ marginTop: '0.7rem' }}>
              {t('reset')}
            </button>
          )}
        </Empty>
      ) : (
      <div className="panel">
        <ResponsiveTable>
          <table className="table">
            <thead>
              <tr>
                <th>{km ? 'អ្នកផ្តល់សេវា' : 'Provider'}</th>
                <th>Provider ref</th>
                <th>Booking</th>
                <th>{t('status')}</th>
                <th className="num">{km ? 'ទឹកប្រាក់' : 'Amount'}</th>
                <th>{km ? 'បង្កើត' : 'Created'}</th>
                <th>{km ? 'ដោះស្រាយ' : 'Resolved'}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pagedPayments.visible.map((p) => (
                <tr key={p.id} className={p.stuck ? 'flagged' : ''}>
                  <td>
                    <div className="small font-bold">
                      {PROVIDER_LABEL[p.provider] ?? p.provider}
                    </div>
                    <div className="small muted">{p.currency_charged}</div>
                  </td>
                  <td className="mono small">{p.provider_ref || '—'}</td>
                  <td>
                    <Link className="mono small" to={`/bookings/${p.booking_id}`}>
                      {p.booking_ref}
                    </Link>
                    <div className="small muted">
                      {km ? p.event_title_km : p.event_title_en}
                    </div>
                  </td>
                  <td>
                    <div className="row row-tight">
                      <Badge status={p.status} />
                      {p.stuck && <span className="badge badge-warm">⚠︎ {t('reconciliation')}</span>}
                    </div>
                  </td>
                  <td className="num font-bold">{usd(p.amount_usd_cents)}</td>
                  <td className="small muted" title={dateTime(p.created_at)}>
                    {timeAgo(p.created_at)}
                  </td>
                  <td className="small muted">{p.resolved_at ? timeAgo(p.resolved_at) : '—'}</td>
                  <td className="num">
                    {/*
                      * Only on an attempt that is still open. A settled or
                      * failed one has an answer already, and asking its
                      * provider again spends a rate-limited call to be told
                      * what the row says.
                      *
                      * This is the button the screen was missing: the flagged
                      * rows below are here precisely because no webhook came,
                      * and until now the only remedy was editing the database.
                      */}
                    {OPEN_STATUSES.includes(p.status) && (
                      <button
                        className="btn btn-sm btn-outline"
                        disabled={checkingId === p.id}
                        onClick={() => checkWithProvider(p)}
                      >
                        <Icon name="refresh" size={14} />
                        {checkingId === p.id
                          ? km
                            ? 'កំពុងពិនិត្យ…'
                            : 'Checking…'
                          : km
                            ? 'ពិនិត្យ'
                            : 'Check'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
        <TablePager
          page={pagedPayments.page}
          pages={pagedPayments.pageCount}
          pageSize={pagedPayments.pageSize}
          onPage={pagedPayments.setPage}
          onPageSize={pagedPayments.setPageSize}
        />
      </div>
      )}

      {!browsingEvents && (
      <p className="hint" style={{ marginTop: '0.8rem' }}>
        {km
          ? 'ជួរដេកដែលដាក់សម្គាល់ = រង់ចាំលើស ១ ម៉ោង ដោយគ្មាន webhook។'
          : 'Highlighted rows have been pending for over an hour with no provider webhook — the reconciliation flag.'}
      </p>
      )}
    </div>
  )
}
