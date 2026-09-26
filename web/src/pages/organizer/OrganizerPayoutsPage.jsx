import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon.jsx";
import FormDialog from "../../components/FormDialog.jsx";
import {
  Alert,
  Badge,
  Empty,
  Field,
  IconSelect,
  ResponsiveTable,
  Stat,
  TablePager,
} from "../../components/ui.jsx";
import {
  SkeletonRegion,
  TableRowsSkeleton,
} from "../../components/Skeleton.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { usd } from "../../lib/format.js";
import { usePaging } from "../../lib/usePaging.js";
import {
  feePercent,
  getMyPayouts,
  getPayableEvents,
  requestPayout,
} from "../../api/payouts.js";

/**
 * Where an organiser's money is.
 *
 * Two lists, in the order somebody actually thinks about them: what you can
 * claim now, then what you have already claimed. A single merged table was the
 * first attempt and it was wrong - a claimable event and a submitted invoice
 * are different kinds of thing, and the first has a button while the second has
 * a status, so every column had to fork on which kind of row it was.
 */

const METHODS = ["ABA", "ACLEDA", "WING", "CANADIA", "OTHER"];

/*
 * What each status means for the person waiting on the money.
 *
 * The badge names the state - Requested, Approved, Paid - which is the
 * platform's vocabulary for its own workflow. None of those words tell an
 * organiser whether anybody has looked at their request yet, or whether the
 * transfer is coming, which is the only thing they opened this page to find
 * out. PAID says it with its reference instead, so it takes no line here.
 */
const STATUS_NOTE = {
  REQUESTED: {
    en: "Waiting to be reviewed.",
    km: "កំពុងរង់ចាំការពិនិត្យ។",
  },
  APPROVED: {
    en: "Approved — the transfer is on its way.",
    km: "បានអនុម័ត — កំពុងផ្ទេរប្រាក់។",
  },
};

/**
 * The 409s the server can answer a claim with, in the organiser's words.
 *
 * Mapped by code rather than shown raw: every one of these is reachable from a
 * screen that was accurate when it loaded, so they are ordinary outcomes rather
 * than errors, and "Request failed with status code 409" is not an answer to
 * any of them.
 */
const CLAIM_ERRORS = {
  PAYOUT_ALREADY_REQUESTED: {
    en: "This event has already been claimed. Reload to see where it got to.",
    km: "ព្រឹត្តិការណ៍នេះត្រូវបានស្នើសុំរួចហើយ។ សូមផ្ទុកឡើងវិញដើម្បីមើលស្ថានភាព។",
  },
  EVENT_NOT_FINISHED: {
    en: "This event has not happened yet.",
    km: "ព្រឹត្តិការណ៍នេះមិនទាន់កើតឡើងនៅឡើយទេ។",
  },
  NOTHING_TO_PAY_OUT: {
    en: "There is nothing left to pay out on this event.",
    km: "មិនមានប្រាក់ត្រូវទូទាត់សម្រាប់ព្រឹត្តិការណ៍នេះទេ។",
  },
};

export default function OrganizerPayoutsPage() {
  const { locale, date } = useLocale();
  const km = locale === "km";
  const toast = useToast();
  useDocumentTitle(km ? "ការទូទាត់" : "Payouts");

  const [payable, setPayable] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // Both halves together: claiming an event moves it from one list to the
    // other, so refreshing only one of them would show the same event twice.
    return Promise.all([getPayableEvents(), getMyPayouts()])
      .then(([a, b]) => {
        setPayable(a || []);
        setPayouts(b || []);
      })
      .catch((e) => {
        setError(e?.response?.status === 403 ? "forbidden" : "unreachable");
        setPayable([]);
        setPayouts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------------------------------------------------ claim form

  /*
   * Invoices accumulate one per finished event and are never deleted, so this
   * list only grows. Claimable events above are a queue that empties; they do
   * not need paging and do not get it.
   */
  const pagedPayouts = usePaging(payouts, "payouts");

  const [claiming, setClaiming] = useState(null); // the PayableEventResponse
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    method: "ABA",
    accountName: "",
    accountNumber: "",
    note: "",
  });

  const openClaim = (event) => {
    setClaiming(event);
    // Prefilled from the last payout that reached the platform, because an
    // organiser is paid into the same account every time and retyping a bank
    // account is exactly the field a typo lands in.
    const previous = payouts[0];
    setForm({
      method: previous?.payout_method || "ABA",
      accountName: previous?.account_name || "",
      accountNumber: previous?.account_number || "",
      note: "",
    });
  };

  const submitClaim = async () => {
    setBusy(true);
    try {
      await requestPayout({
        event_id: claiming.event_id,
        payout_method: form.method,
        account_name: form.accountName,
        account_number: form.accountNumber,
        note: form.note,
      });
      setClaiming(null);
      toast(km ? "បានផ្ញើសំណើទូទាត់" : "Payout requested", "success");
      await load();
    } catch (e) {
      const code = e?.response?.data?.errorCode;
      const known = CLAIM_ERRORS[code];
      toast(
        known
          ? known[locale] || known.en
          : km
            ? "មិនអាចផ្ញើសំណើបានទេ"
            : "Could not send the request",
        "error",
      );
      // The screen is stale in every one of these cases, so reload rather than
      // leaving a button that will keep failing the same way.
      if (known) await load();
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------- headline

  const totals = useMemo(() => {
    const sum = (rows) => rows.reduce((a, r) => a + (r.net_usd_cents || 0), 0);
    return {
      claimable: sum(payable),
      inFlight: sum(
        payouts.filter(
          (p) => p.status === "REQUESTED" || p.status === "APPROVED",
        ),
      ),
      paid: sum(payouts.filter((p) => p.status === "PAID")),
    };
  }, [payable, payouts]);

  if (error) {
    return (
      <div className="container container-wide">
        <Alert
          tone="danger"
          title={km ? "មិនអាចផ្ទុកបានទេ" : "Could not load payouts"}
        >
          {error === "forbidden"
            ? km
              ? "គណនីនេះគ្មានទម្រង់អ្នករៀបចំ"
              : "This account has no organizer profile."
            : km
              ? "សូមពិនិត្យថាម៉ាស៊ីនបម្រើកំពុងដំណើរការ"
              : "Check that the API is running, then reload."}
        </Alert>
      </div>
    );
  }

  return (
    <div className="container container-wide">
      {/* The page's own title, outside the cards - the same .page-head the
          dashboard, venues and check-in use, and the admin side throughout.
          This screen had none: its <h1> was "Ready to claim", which is the
          name of the first section rather than of the page, so the document
          title and the heading disagreed and the two sections below read as
          siblings of the thing that was supposed to contain them. */}
      <div className="page-head">
        <div>
          <div className="page-title-lockup">
            <span className="icon-chip green lg">
              <Icon name="wallet" size={22} />
            </span>
            <h1>{km ? "ការទូទាត់" : "Payouts"}</h1>
          </div>
          {/* The rule, not a summary. The two sections below already say
              "events that have finished and still have money owing" and "every
              request you have made" - a page subtitle that said both again
              would be the third line in a column saying one thing. What is
              said nowhere else is when you may claim, how often, and that the
              fee comes out before the transfer rather than after it. */}
          <p>
            {km
              ? "ស្នើសុំបានពេលព្រឹត្តិការណ៍បញ្ចប់ — មួយសំណើក្នុងមួយព្រឹត្តិការណ៍ ហើយកាត់កម្រៃសេវារួចមុនផ្ទេរ។"
              : "Claimable once an event has finished — one request per event, paid net of the platform fee."}
          </p>
        </div>
      </div>

      {/* ----------------------------------------------------------- stats */}
      <div className="stats" style={{ marginBottom: "1.2rem" }}>
        <Stat
          label={km ? "អាចស្នើសុំបាន" : "Ready to claim"}
          value={usd(totals.claimable)}
          sub={`${payable.length} ${km ? "ព្រឹត្តិការណ៍" : payable.length === 1 ? "event" : "events"}`}
          icon="wallet"
          tone="gold"
        />
        <Stat
          label={km ? "កំពុងដំណើរការ" : "In progress"}
          value={usd(totals.inFlight)}
          sub={
            km ? "រង់ចាំការអនុម័ត ឬការផ្ទេរ" : "Awaiting approval or transfer"
          }
          icon="clock"
        />
        <Stat
          label={km ? "បានទទួលរួច" : "Paid out"}
          value={usd(totals.paid)}
          sub={(() => {
            const paid = payouts.filter((p) => p.status === "PAID").length;
            return `${paid} ${km ? "វិក្កយបត្រ" : paid === 1 ? "invoice" : "invoices"}`;
          })()}
          icon="checkCircle"
          tone="green"
        />
      </div>

      {/* -------------------------------------------------- claimable events */}
      <section className="bg-surface border border-line rounded-hero shadow-card overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-line-2">
          <h2 className="text-lg font-bold text-ink m-0">
            {km ? "ព្រឹត្តិការណ៍ដែលអាចស្នើសុំប្រាក់" : "Ready to claim"}
          </h2>
          <p className="text-small text-muted m-0 mt-0.5">
            {km
              ? "ព្រឹត្តិការណ៍ដែលបានបញ្ចប់ ហើយនៅមានប្រាក់មិនទាន់ទូទាត់"
              : "Events that have finished and still have money owing."}
          </p>
        </div>

        {loading ? (
          <SkeletonRegion
            className="px-5 py-4"
            label={km ? "កំពុងផ្ទុក…" : "Loading…"}
          >
            <div className="h-20 rounded-card bg-surface-2" />
          </SkeletonRegion>
        ) : payable.length === 0 ? (
          <Empty
            icon="wallet"
            title={km ? "គ្មានអ្វីត្រូវស្នើសុំទេ" : "Nothing to claim yet"}
          >
            {km
              ? "នៅពេលព្រឹត្តិការណ៍មួយបញ្ចប់ ហើយមានការលក់សំបុត្រ វានឹងបង្ហាញនៅទីនេះ។"
              : "Once an event has finished and sold tickets, it shows up here."}
          </Empty>
        ) : (
          <div className="px-5 py-4 grid gap-3">
            {payable.map((row) => (
              <article
                key={row.event_id}
                className="border border-line-2 rounded-card p-4 flex items-start justify-between gap-4 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink m-0">
                    {km ? row.title_km : row.title_en}
                  </p>
                  <p className="text-small text-muted m-0 mt-0.5">
                    {date(row.starts_at)} · {row.tickets_sold}{" "}
                    {km
                      ? "សំបុត្រ"
                      : row.tickets_sold === 1
                        ? "ticket"
                        : "tickets"}{" "}
                    · {row.bookings_count} {km ? "ការកក់" : "bookings"}
                  </p>

                  {/* The same three lines the invoice will print, before the
                      organiser commits to them - being shown $1,080 after
                      agreeing to $1,200 is how a platform loses trust over an
                      amount it disclosed all along. */}
                  <dl className="text-small mt-2 m-0 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 w-max">
                    <dt className="text-muted m-0">
                      {km ? "លក់សរុប" : "Gross sales"}
                    </dt>
                    <dd className="m-0 text-right">
                      {usd(row.gross_usd_cents)}
                    </dd>
                    <dt className="text-muted m-0">
                      {km ? "កម្រៃសេវា" : "Platform fee"} (
                      {feePercent(row.fee_bps)})
                    </dt>
                    <dd className="m-0 text-right">
                      −{usd(row.fee_usd_cents)}
                    </dd>
                  </dl>
                </div>

                <div className="text-right">
                  <div className="text-tiny text-muted uppercase tracking-wide">
                    {km ? "នឹងទទួលបាន" : "You receive"}
                  </div>
                  <div className="text-lg font-bold text-success">
                    {usd(row.net_usd_cents)}
                  </div>

                  {/* Unconditional: the server only returns events that can
                      actually be claimed, so there is no such thing as a card
                      here whose button would fail. */}
                  <button
                    type="button"
                    className="btn btn-primary mt-2"
                    onClick={() => openClaim(row)}
                  >
                    <Icon name="wallet" size={15} />
                    {km ? "ស្នើសុំប្រាក់" : "Request payout"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- the history */}
      <section className="bg-surface border border-line rounded-hero shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-line-2">
          <h2 className="text-lg font-bold text-ink m-0">
            {km ? "វិក្កយបត្ររបស់អ្នក" : "Your invoices"}
          </h2>
          <p className="text-small text-muted m-0 mt-0.5">
            {km
              ? "សំណើទាំងអស់ និងស្ថានភាពរបស់វា"
              : "Every request you have made, and where it got to."}
          </p>
        </div>

        <ResponsiveTable>
          <table className="table">
            <thead>
              <tr>
                <th>{km ? "វិក្កយបត្រ" : "Invoice"}</th>
                <th>{km ? "ព្រឹត្តិការណ៍" : "Event"}</th>
                <th className="whitespace-nowrap">
                  {km ? "ស្នើសុំនៅ" : "Requested"}
                </th>
                <th>{km ? "ស្ថានភាព" : "Status"}</th>
                <th className="num whitespace-nowrap">
                  {km ? "ទឹកប្រាក់" : "Amount"}
                </th>
                <th />
              </tr>
            </thead>
            {loading ? (
              <TableRowsSkeleton
                rows={3}
                cols={6}
                cellClassName="px-[0.9rem] py-[0.7rem]"
                rowClassName="border-b border-line-2"
              />
            ) : (
              <tbody>
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <Empty
                        icon="card"
                        title={km ? "មិនទាន់មានវិក្កយបត្រ" : "No invoices yet"}
                      />
                    </td>
                  </tr>
                ) : (
                  pagedPayouts.visible.map((p) => (
                    <tr key={p.id} className="border-b border-line-2">
                      <td className="font-mono text-small">{p.invoice_no}</td>
                      <td>{km ? p.event_title_km : p.event_title_en}</td>
                      <td className="min-[901px]:whitespace-nowrap">
                        {date(p.requested_at)}
                      </td>
                      <td>
                        <Badge status={p.status} />
                        {p.status === "PAID" && p.paid_reference && (
                          <p className="text-tiny text-muted m-0 mt-1">
                            {km ? "លេខយោង" : "Ref"}: {p.paid_reference}
                          </p>
                        )}
                        {STATUS_NOTE[p.status] && (
                          <p className="text-tiny text-muted m-0 mt-1">
                            {STATUS_NOTE[p.status][locale] ||
                              STATUS_NOTE[p.status].en}
                          </p>
                        )}
                      </td>
                      <td className="text-right font-semibold min-[901px]:whitespace-nowrap">
                        {usd(p.net_usd_cents)}
                      </td>
                      <td className="num">
                        <Link
                          className="btn btn-sm btn-outline"
                          to={`/organizer/payouts/${p.id}`}
                        >
                          {km ? "វិក្កយបត្រ" : "Invoice"}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            )}
          </table>
        </ResponsiveTable>
        {!loading && (
          <TablePager
            page={pagedPayouts.page}
            pages={pagedPayouts.pageCount}
            pageSize={pagedPayouts.pageSize}
            onPage={pagedPayouts.setPage}
            onPageSize={pagedPayouts.setPageSize}
          />
        )}
      </section>

      {/* --------------------------------------------------------- the form */}
      <FormDialog
        open={Boolean(claiming)}
        busy={busy}
        title={km ? "ស្នើសុំប្រាក់" : "Request a payout"}
        subtitle={
          claiming
            ? `${km ? claiming.title_km : claiming.title_en} · ${usd(claiming.net_usd_cents)}`
            : undefined
        }
        submitLabel={km ? "ផ្ញើសំណើ" : "Send request"}
        submitDisabled={!form.accountName.trim() || !form.accountNumber.trim()}
        onSubmit={submitClaim}
        onClose={() => setClaiming(null)}
      >
        {claiming && (
          <>
            {/* Restated inside the dialog. The card behind it is covered by the
                overlay, and "send request" with the amount out of sight is a
                confirmation of nothing. */}
            <dl className="text-small m-0 mb-3 p-3 rounded-card bg-surface-2 grid grid-cols-[1fr_auto] gap-y-1">
              <dt className="text-muted m-0">
                {km ? "លក់សរុប" : "Gross sales"}
              </dt>
              <dd className="m-0 text-right">
                {usd(claiming.gross_usd_cents)}
              </dd>
              <dt className="text-muted m-0">
                {km ? "កម្រៃសេវា" : "Platform fee"} (
                {feePercent(claiming.fee_bps)})
              </dt>
              <dd className="m-0 text-right">−{usd(claiming.fee_usd_cents)}</dd>
              <dt className="font-bold m-0 pt-1 border-t border-line-2">
                {km ? "នឹងទទួលបាន" : "You receive"}
              </dt>
              <dd className="font-bold text-right pt-1 border-t border-line-2 m-0">
                {usd(claiming.net_usd_cents)}
              </dd>
            </dl>

            <Field label={km ? "ធនាគារ / សេវាកម្ម" : "Bank or service"}>
              <IconSelect
                value={form.method}
                onChange={(v) => setForm((f) => ({ ...f, method: v }))}
                ariaLabel={km ? "ធនាគារ / សេវាកម្ម" : "Bank or service"}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "OTHER" ? (km ? "ផ្សេងទៀត" : "Other") : m}
                  </option>
                ))}
              </IconSelect>
            </Field>

            <Field
              label={km ? "ឈ្មោះគណនី" : "Account name"}
              hint={
                km
                  ? "ដូចដែលបង្ហាញនៅធនាគារ"
                  : "Exactly as it appears at the bank."
              }
            >
              <input
                className="input"
                value={form.accountName}
                maxLength={120}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountName: e.target.value }))
                }
              />
            </Field>

            <Field label={km ? "លេខគណនី" : "Account number"}>
              <input
                className="input font-mono"
                value={form.accountNumber}
                maxLength={64}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountNumber: e.target.value }))
                }
              />
            </Field>

            <Field label={km ? "កំណត់ចំណាំ" : "Note for the admin"} optional>
              <textarea
                className="input"
                rows={3}
                maxLength={1000}
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </Field>
          </>
        )}
      </FormDialog>
    </div>
  );
}
