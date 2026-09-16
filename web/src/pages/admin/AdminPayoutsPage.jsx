import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ContactButtons from '../../components/ContactButtons.jsx'
import Icon from '../../components/Icon.jsx'
import ConfirmDialog from '../../components/ConfirmDialog.jsx'
import FormDialog from '../../components/FormDialog.jsx'
import { Alert, Badge, Empty, Field, ResponsiveTable, TablePager } from '../../components/ui.jsx'
import { TableRowsSkeleton } from '../../components/Skeleton.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { timeAgo, usd } from '../../lib/format.js'
import { usePaging } from '../../lib/usePaging.js'
import {
  approvePayout,
  feePercent,
  getAdminPayout,
  getAdminPayoutCounts,
  getAdminPayouts,
  markPayoutPaid,
  PAYOUT_STATUSES,
} from '../../api/payouts.js'

/**
 * The payout queue.
 *
 * Tabbed by status, like the applications screen, and for the same reason: the
 * columns a settled payout needs are the columns a waiting one needs, so a
 * second screen would have been this screen with a different title.
 *
 * There is no refuse action. An admin who does not intend to pay a request
 * leaves it in "Waiting" - nothing here forces a decision, and a request that
 * should not be paid is a conversation to have with the organiser rather than a
 * button.
 *
 * The tab that matters most is APPROVED, and it is the one a queue would
 * normally not have. It holds money the platform has agreed to send and has not
 * sent - a state that is nobody's problem until somebody looks, which is
 * precisely why it gets a tab of its own rather than being folded into "done".
 */

/**
 * How the payable figure was arrived at, in one tiny line under it.
 *
 * Both terms carry their own noun, and that is the whole point. The first
 * version printed bare amounts joined by a dash - "$0.60 − $0.06 (10%)" - which
 * reads just as naturally as a range, or as something being clawed back, as it
 * does as a commission.
 */
function derivation(p, km) {
  const gross = `${usd(p.gross_usd_cents)} ${km ? 'សរុប' : 'gross'}`
  const fee = `${usd(p.fee_usd_cents)} ${km ? 'កម្រៃ' : 'fee'} (${feePercent(p.fee_bps)})`
  return `${gross} − ${fee}`
}

const TAB_LABELS = {
  REQUESTED: { en: 'Waiting', km: 'រង់ចាំ' },
  APPROVED: { en: 'To transfer', km: 'ត្រូវផ្ទេរ' },
  PAID: { en: 'Paid', km: 'បានទូទាត់' },
}

export default function AdminPayoutsPage() {
  const { locale, dateTime, date } = useLocale()
  const km = locale === 'km'
  const toast = useToast()
  useDocumentTitle(km ? 'ការទូទាត់' : 'Payouts')

  const [tab, setTab] = useState('REQUESTED')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(
    (status) => {
      setLoading(true)
      setError(false)
      // Counts alongside the list, not derived from it: the tabs have to show
      // every status while the list holds one, and a badge computed from the
      // rows in hand would read 0 on every tab but the open one.
      return Promise.all([getAdminPayouts(status), getAdminPayoutCounts()])
        .then(([list, c]) => {
          setRows(list || [])
          setCounts(c || {})
        })
        .catch(() => {
          setError(true)
          setRows([])
        })
        .finally(() => setLoading(false))
    },
    [],
  )

  useEffect(() => {
    load(tab)
  }, [load, tab])

  /*
   * Paging, keyed on the tab: each one is a different list, so switching starts
   * at its first page rather than wherever the last tab was being read.
   *
   * PAID is why this is here. Waiting and To transfer are queues that get
   * emptied, but every payout the platform has ever made stays in Paid.
   */
  const paged = usePaging(rows, tab)

  /*
   * What the tab on screen is worth. The badge beside each tab says how many
   * requests are in it; this says how much money they are, which is the number
   * that decides whether the queue can wait until tomorrow.
   *
   * Net, not gross - net is what leaves the platform's account. Summed over
   * `rows` rather than `paged.visible` on purpose: this describes the tab, not
   * the page of it currently rendered.
   */
  const tabTotal = rows.reduce((a, r) => a + r.net_usd_cents, 0)

  // ---------------------------------------------------------------- actions

  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState(null)
  const [paying, setPaying] = useState(null)
  const [payForm, setPayForm] = useState({ reference: '', note: '' })

  /**
   * Every action funnels through here so the stale-row case is handled once.
   * Two admins working this queue at the same time is the ordinary way to get a
   * 409, and the right response to one is always the same: say what happened
   * and reload, because the row on screen is no longer the row in the database.
   */
  const run = async (fn, successMessage, close) => {
    setBusy(true)
    try {
      await fn()
      close()
      toast(successMessage, 'success')
      await load(tab)
    } catch (e) {
      const code = e?.response?.data?.errorCode
      if (code === 'PAYOUT_ALREADY_DECIDED') {
        toast(
          km ? 'សំណើនេះត្រូវបានសម្រេចរួចហើយ' : 'Somebody has already decided this one.',
          'error',
        )
        close()
        await load(tab)
      } else {
        toast(km ? 'មិនបានសម្រេច' : 'That did not go through', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  /**
   * The account number arrives masked in the list and unmasked from this
   * endpoint. Fetched when the transfer dialog opens rather than with the
   * whole page, so a screenful of bank accounts is never on screen at once.
   */
  const openPay = async (row) => {
    setPayForm({ reference: '', note: '' })
    setPaying(row)
    try {
      const full = await getAdminPayout(row.id)
      setPaying(full)
    } catch {
      // The masked row is still enough to identify the payout; the dialog says
      // so rather than refusing to open over a failed second request.
      toast(km ? 'មិនអាចផ្ទុកលេខគណនីបានទេ' : 'Could not load the full account number', 'error')
    }
  }

  return (
    <div className="container container-wide">
      {/* Title and subtitle outside the card, like every other screen in both
          role areas. They lived in the card's own header, so the page had no
          heading of its own and the card carried one instead. */}
      <div className="page-head">
        <div>
          <h1>{km ? 'ការទូទាត់ជូនអ្នករៀបចំ' : 'Organizer payouts'}</h1>
          <p>
            {km
              ? 'អនុម័តសំណើ រួចកត់ត្រាការផ្ទេរប្រាក់ជាមួយលេខយោង'
              : 'Approve a request, then record the transfer against its reference.'}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-hero shadow-card overflow-hidden">

        {/* ------------------------------------------------------------ tabs */}
        {/* Tabs, not buttons. They were drawn as a row of btn-sm, so the one
            you were on differed from the other two by a hairline border - and
            the strip sat flush against the window edge while the header and
            table above and below it were padded. */}
        <div className="tabbar" role="tablist" aria-label={km ? 'ស្ថានភាព' : 'Status'}>
          {PAYOUT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-pressed={tab === s}
              aria-selected={tab === s}
              onClick={() => setTab(s)}
            >
              {TAB_LABELS[s][locale] || TAB_LABELS[s].en}
              <span className="tab-n">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>



        {/* The open tab, in money, directly under the tabs that select it.
            Replaces an alert that said this for the APPROVED tab alone - the
            other two had a count and no idea what it was worth. It follows the
            tabs rather than the title because it changes with them. */}
        {!loading && !error && rows.length > 0 && (
          <p className="px-5 pt-3 text-small text-muted m-0">
            {rows.length} {km ? 'សំណើ' : rows.length === 1 ? 'request' : 'requests'} ·{' '}
            <span className="font-semibold text-ink">{usd(tabTotal)}</span>{' '}
            {tab === 'PAID'
              ? km
                ? 'បានផ្ទេររួច'
                : 'transferred'
              : km
                ? 'ត្រូវទូទាត់'
                : 'payable'}
          </p>
        )}

        {/* ----------------------------------------------------------- table */}
        <ResponsiveTable>
          <table className="table">
            <thead>
              <tr>
                <th>{km ? 'វិក្កយបត្រ' : 'Invoice'}</th>
                <th>{km ? 'អ្នករៀបចំ' : 'Organizer'}</th>
                <th>{km ? 'ព្រឹត្តិការណ៍' : 'Event'}</th>
                <th>{km ? 'ផ្ញើទៅ' : 'Send to'}</th>
                <th className="num whitespace-nowrap">{km ? 'ត្រូវទូទាត់' : 'Payable'}</th>
                <th>{km ? 'ស្ថានភាព' : 'Status'}</th>
                <th className="num">{km ? 'សកម្មភាព' : 'Action'}</th>
              </tr>
            </thead>
            {loading ? (
              <TableRowsSkeleton rows={5} cols={7} cellClassName="px-[0.9rem] py-[0.7rem]" rowClassName="border-b border-line-2" />
            ) : (
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={7}>
                      <Empty icon="alert" title={km ? 'មិនអាចផ្ទុកបានទេ' : 'Could not load payouts'}>
                        {km ? 'សូមពិនិត្យម៉ាស៊ីនបម្រើ' : 'Check that the API is running, then reload.'}
                      </Empty>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <Empty icon="wallet" title={km ? 'គ្មានអ្វីនៅទីនេះទេ' : 'Nothing here'}>
                        {tab === 'REQUESTED'
                          ? km
                            ? 'គ្មានសំណើថ្មីទេ'
                            : 'No payout requests are waiting.'
                          : undefined}
                      </Empty>
                    </td>
                  </tr>
                ) : (
                  paged.visible.map((p) => (
                    <tr key={p.id} className="border-b border-line-2">
                      <td>
                        {/* The invoice number opens the invoice. It was plain
                            text until now, so the admin who makes the transfer
                            had no way to read the document it is made against
                            - while the organiser could print theirs. */}
                        <Link className="font-mono text-small" to={`/admin/payouts/${p.id}`}>
                          {p.invoice_no}
                        </Link>
                        <p className="text-tiny text-muted m-0">{dateTime(p.requested_at)}</p>
                      </td>
                      <td>
                        {km ? p.organizer_name_km : p.organizer_name_en}
                        {/* The same button the review queue carries, and for
                            the same reason: the question an admin has here is
                            usually for the payee, not for the record. Facebook
                            is left off - a transfer query wants the channel the
                            organiser actually watches, and two buttons in a
                            table row is a toolbar. */}
                        <ContactButtons telegram={p.organizer_telegram_handle} km={km} />
                      </td>
                      <td>
                        {km ? p.event_title_km : p.event_title_en}
                        <p className="text-tiny text-muted m-0">
                          {date(p.event_starts_at)} · {p.tickets_sold} {km ? 'សំបុត្រ' : 'tickets'}
                        </p>
                      </td>
                      <td>
                        {p.payout_method}
                        <p className="text-tiny text-muted m-0">{p.account_name}</p>
                        <p className="text-tiny text-muted m-0 font-mono">{p.account_number}</p>
                      </td>
                      <td className="num whitespace-nowrap">
                        <b>{usd(p.net_usd_cents)}</b>
                        {/* The derivation, small, under the number an admin is
                            about to transfer. Checking it should not require
                            opening anything. */}
                        <p className="text-tiny text-muted m-0">{derivation(p, km)}</p>
                      </td>
                      <td>
                        <Badge status={p.status} />
                        {/* Age, on the rows where waiting is the problem. The
                            queue is ordered oldest-first, so this is what that
                            order is showing - and a request sitting for eleven
                            days reads as a date nobody subtracts. */}
                        {p.status !== 'PAID' && (
                          <p className="text-tiny text-muted m-0 mt-1">
                            {km ? 'រង់ចាំ' : 'waiting'} {timeAgo(p.requested_at).replace(' ago', '')}
                          </p>
                        )}
                        {p.reviewed_by_name && (
                          <p className="text-tiny text-muted m-0 mt-1">
                            {km ? 'ដោយ' : 'by'} {p.reviewed_by_name}
                          </p>
                        )}
                        {p.status === 'PAID' && p.paid_reference && (
                          <p className="text-tiny text-muted m-0 font-mono">{p.paid_reference}</p>
                        )}
                      </td>
                      <td className="num whitespace-nowrap">
                        {p.status === 'REQUESTED' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => setApproving(p)}
                          >
                            {km ? 'អនុម័ត' : 'Approve'}
                          </button>
                        )}
                        {p.status === 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => openPay(p)}
                          >
                            <Icon name="bank" size={14} />
                            {km ? 'កត់ត្រាការផ្ទេរ' : 'Record transfer'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            )}
          </table>
        </ResponsiveTable>
        {/* Not while the skeleton is up: a pager over rows that have not
            arrived says "page 1 of 1", then contradicts itself a moment later. */}
        {!loading && !error && (
          <TablePager
            page={paged.page}
            pages={paged.pageCount}
            pageSize={paged.pageSize}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
          />
        )}
      </div>

      {/* ------------------------------------------------------- approve */}
      <ConfirmDialog
        open={Boolean(approving)}
        busy={busy}
        /* Only 'danger' and 'warn' have a styled icon chip, and 'warn' is the
           honest one anyway: approving is not destructive, but it is money. */
        tone="warn"
        title={km ? 'អនុម័តការទូទាត់?' : 'Approve this payout?'}
        confirmLabel={km ? 'អនុម័ត' : 'Approve'}
        onClose={() => setApproving(null)}
        onConfirm={() =>
          run(
            () => approvePayout(approving.id),
            km ? 'បានអនុម័ត' : 'Approved',
            () => setApproving(null),
          )
        }
      >
        {approving && (
          <>
            {/* Said plainly, because it is the thing most likely to be assumed
                wrongly: approving does not send anything. */}
            {km
              ? `អនុម័ត ${usd(approving.net_usd_cents)} ជូន ${approving.organizer_name_km}។ ប្រាក់មិនទាន់ផ្ញើនៅឡើយទេ — កត់ត្រាការផ្ទេរបន្ទាប់ពីអ្នកបានផ្ញើរួច។`
              : `Approves ${usd(approving.net_usd_cents)} to ${approving.organizer_name_en}. No money moves yet — record the transfer once you have sent it.`}
          </>
        )}
      </ConfirmDialog>

      {/* --------------------------------------------------- mark as paid */}
      <FormDialog
        open={Boolean(paying)}
        busy={busy}
        title={km ? 'កត់ត្រាការផ្ទេរប្រាក់' : 'Record the transfer'}
        submitLabel={km ? 'កត់ត្រា' : 'Record it'}
        submitDisabled={!payForm.reference.trim()}
        onClose={() => setPaying(null)}
        onSubmit={() =>
          run(
            () => markPayoutPaid(paying.id, payForm.reference.trim(), payForm.note),
            km ? 'បានកត់ត្រា' : 'Recorded',
            () => setPaying(null),
          )
        }
      >
        {paying && (
          <>
            {/* The transfer details, restated where the admin is typing the
                reference - they are copying these into a banking app in another
                window, and a dialog that hid them would send them back. */}
            <dl className="text-small m-0 mb-3 p-3 rounded-card bg-surface-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted m-0">{km ? 'ចំនួន' : 'Amount'}</dt>
              <dd className="m-0 font-bold">{usd(paying.net_usd_cents)}</dd>
              <dt className="text-muted m-0">{km ? 'ធនាគារ' : 'Bank'}</dt>
              <dd className="m-0">{paying.payout_method}</dd>
              <dt className="text-muted m-0">{km ? 'ឈ្មោះគណនី' : 'Account name'}</dt>
              <dd className="m-0">{paying.account_name}</dd>
              <dt className="text-muted m-0">{km ? 'លេខគណនី' : 'Account'}</dt>
              <dd className="m-0 font-mono">{paying.account_number}</dd>
            </dl>

            <Field
              label={km ? 'លេខយោងពីធនាគារ' : 'Bank reference'}
              hint={
                km
                  ? 'អ្នករៀបចំនឹងឃើញលេខនេះ ហើយប្រើវាពេលសួរធនាគារ'
                  : 'The organizer sees this and will quote it to their bank.'
              }
            >
              <input
                className="input font-mono"
                value={payForm.reference}
                maxLength={120}
                onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </Field>

            <Field label={km ? 'កំណត់ចំណាំ' : 'Note'} optional>
              <textarea
                className="input"
                rows={2}
                maxLength={1000}
                value={payForm.note}
                onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
              />
            </Field>
          </>
        )}
      </FormDialog>
    </div>
  )
}
