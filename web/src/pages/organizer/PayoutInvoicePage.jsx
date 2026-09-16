import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge } from '../../components/ui.jsx'
import { SkeletonPanel } from '../../components/Skeleton.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { usd } from '../../lib/format.js'
import { feePercent, getAdminPayout, getMyPayout } from '../../api/payouts.js'

/**
 * One row of the money table. Signed so a deduction reads as one at a glance
 * rather than only in context - an organiser scanning the column wants the
 * minus signs to line up.
 *
 * At module scope rather than inside the page, which is not a style
 * preference: a component declared during render is a different type on every
 * pass, so React throws its subtree away and rebuilds it each time.
 */
function Line({ label, value, negative = false, strong = false }) {
  return (
    <div className={`invoice-line ${strong ? 'invoice-line-total' : ''}`}>
      <span>{label}</span>
      <span className="font-mono">
        {negative ? '−' : ''}
        {usd(value)}
      </span>
    </div>
  )
}

/**
 * The invoice, as a page that prints.
 *
 * No PDF library anywhere in this. The document is bilingual, and embedding a
 * Khmer font into a server-rendered PDF is real work for a result the browser
 * already produces correctly from the fonts the rest of the app loads. Print to
 * PDF is one keystroke away and gives the organiser a file their accountant
 * will accept.
 *
 * What that costs is control over pagination, which is why the layout is one
 * column of blocks that can break anywhere rather than anything positioned.
 *
 * The chrome - nav, buttons, the back link - is hidden at print time by
 * `.no-print`, defined once in the stylesheet beside the ticket's own print
 * rules rather than in a style tag here.
 *
 * <p><b>Two audiences, one document.</b> The organiser reads it at
 * /organizer/payouts/:id and an admin at /admin/payouts/:id, and which route
 * you came in by decides only which endpoint fetches the row and where "back"
 * goes. The invoice itself is deliberately identical: it is the settlement
 * record, and an admin discussing it with an organiser needs to be looking at
 * the same piece of paper, down to the wording.
 *
 * <p>The admin could not reach it at all until now, which meant the one
 * printable per-event financial document on the platform was invisible to the
 * person who actually makes the transfer.
 */
export default function PayoutInvoicePage() {
  const { id } = useParams()
  const { locale, dateTime, date } = useLocale()
  const km = locale === 'km'

  /*
   * Read off the path rather than off the signed-in role. An admin is allowed
   * to hold both, and the question here is not "what may this person do" - the
   * server settles that - but "which list did they arrive from", which is the
   * only thing the back link can honestly answer.
   */
  const admin = useLocation().pathname.startsWith('/admin')
  const backTo = admin ? '/admin/payouts' : '/organizer/payouts'

  const [payout, setPayout] = useState(null)
  const [error, setError] = useState(null)
  useDocumentTitle(payout ? payout.invoice_no : km ? 'វិក្កយបត្រ' : 'Invoice')

  useEffect(() => {
    let cancelled = false
    ;(admin ? getAdminPayout : getMyPayout)(id)
      .then((data) => !cancelled && setPayout(data))
      // 404 covers both "no such invoice" and "not yours" on purpose - see the
      // note on the endpoint. Nothing here needs to tell them apart.
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [id, admin])

  if (error) {
    return (
      <div className="container">
        <Alert tone="danger" title={km ? 'រកមិនឃើញវិក្កយបត្រ' : 'Invoice not found'}>
          <Link to={backTo}>{km ? 'ត្រឡប់ទៅការទូទាត់' : 'Back to payouts'}</Link>
        </Alert>
      </div>
    )
  }

  if (!payout) {
    return (
      <div className="container">
        <SkeletonPanel lines={8} />
      </div>
    )
  }

  return (
    <div className="container invoice-page">
      {/* ------------------------------------------------------ the chrome */}
      <div className="no-print flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link className="btn btn-ghost btn-sm" to={backTo}>
          <Icon name="arrowLeft" size={15} />
          {km ? 'ត្រឡប់ក្រោយ' : 'Back to payouts'}
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="card" size={15} />
          {km ? 'បោះពុម្ព / រក្សាទុក PDF' : 'Print or save as PDF'}
        </button>
      </div>

      <article className="invoice">
        {/* ------------------------------------------------------- heading */}
        <header className="invoice-head">
          <div>
            <p className="invoice-brand">CamboBook</p>
            <p className="invoice-brand-sub">
              {km ? 'វេទិកាលក់សំបុត្រព្រឹត្តិការណ៍' : 'Event ticketing platform'}
            </p>
          </div>
          <div className="text-right">
            <p className="invoice-label">{km ? 'វិក្កយបត្រទូទាត់' : 'Payout invoice'}</p>
            <p className="invoice-no">{payout.invoice_no}</p>
            {/* The badge is chrome-coloured and prints grey, which is fine -
                a printed invoice that says PAID in black is still unambiguous. */}
            <Badge status={payout.status} />
          </div>
        </header>

        {/* --------------------------------------------------- who and what */}
        <section className="invoice-parties">
          <div>
            <h2 className="invoice-section-label">{km ? 'ចេញជូន' : 'Billed to'}</h2>
            <p className="font-bold m-0">
              {km ? payout.organizer_name_km : payout.organizer_name_en}
            </p>
            <p className="text-small text-muted m-0">
              {payout.payout_method} · {payout.account_name}
            </p>
            <p className="text-small text-muted m-0 font-mono">{payout.account_number}</p>
          </div>
          <div>
            <h2 className="invoice-section-label">{km ? 'សម្រាប់ព្រឹត្តិការណ៍' : 'For event'}</h2>
            <p className="font-bold m-0">{km ? payout.event_title_km : payout.event_title_en}</p>
            <p className="text-small text-muted m-0">
              {km ? 'ប្រព្រឹត្តទៅនៅ' : 'Held'} {date(payout.event_starts_at)}
            </p>
            <p className="text-small text-muted m-0">
              {payout.tickets_sold} {km ? 'សំបុត្រ' : 'tickets'} · {payout.bookings_count}{' '}
              {km ? 'ការកក់' : 'bookings'}
            </p>
          </div>
          <div>
            <h2 className="invoice-section-label">{km ? 'កាលបរិច្ឆេទ' : 'Dates'}</h2>
            <p className="text-small m-0">
              {km ? 'ស្នើសុំ' : 'Requested'}: {dateTime(payout.requested_at)}
            </p>
            {payout.reviewed_at && (
              <p className="text-small m-0">
                {km ? 'សម្រេច' : 'Decided'}: {dateTime(payout.reviewed_at)}
              </p>
            )}
            {payout.paid_at && (
              <p className="text-small m-0">
                {km ? 'ទូទាត់' : 'Paid'}: {dateTime(payout.paid_at)}
              </p>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- the numbers */}
        <section className="invoice-money">
          <Line label={km ? 'ការលក់សំបុត្រសរុប' : 'Gross ticket sales'} value={payout.gross_usd_cents} />
          <Line
            label={`${km ? 'កម្រៃសេវាវេទិកា' : 'Platform fee'} (${feePercent(payout.fee_bps)})`}
            value={payout.fee_usd_cents}
            negative
          />
          <Line
            label={km ? 'ចំនួនត្រូវទូទាត់' : 'Net payable'}
            value={payout.net_usd_cents}
            strong
          />
        </section>

        {/* --------------------------------------------------- the transfer */}
        {payout.status === 'PAID' && (
          <section className="invoice-paid">
            <Icon name="checkCircle" size={18} />
            <div>
              <p className="font-bold m-0">{km ? 'បានទូទាត់រួចរាល់' : 'Paid in full'}</p>
              <p className="text-small m-0">
                {km ? 'លេខយោងផ្ទេរប្រាក់' : 'Transfer reference'}:{' '}
                <span className="font-mono">{payout.paid_reference}</span>
              </p>
            </div>
          </section>
        )}

        {payout.note && (
          <section className="invoice-note">
            <p className="invoice-section-label">{km ? 'កំណត់ចំណាំ' : 'Note'}</p>
            <p className="m-0">{payout.note}</p>
          </section>
        )}

        <footer className="invoice-foot">
          {km
            ? 'ឯកសារនេះត្រូវបានបង្កើតដោយស្វ័យប្រវត្តិ ហើយមានសុពលភាពដោយមិនចាំបាច់មានហត្ថលេខា។'
            : 'This document was generated automatically and is valid without a signature.'}
        </footer>
      </article>
    </div>
  )
}
