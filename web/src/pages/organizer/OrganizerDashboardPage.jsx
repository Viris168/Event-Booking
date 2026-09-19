import { useEffect, useState } from "react";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { Link, useNavigate } from "react-router-dom";
import ActionMenu from "../../components/ActionMenu.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Icon from "../../components/Icon.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import {
  Badge,
  Empty,
  Progress,
  ResponsiveTable,
  TablePager,
} from "../../components/ui.jsx";
import { OrganizerDashboardSkeleton } from "../../components/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { usd } from "../../lib/format.js";
import { usePaging } from "../../lib/usePaging.js";
import {
  SALES_UI,
  displayStatus,
  isPast,
  salesState,
} from "../../lib/salesState.js";
import {
  deleteOwnEvent,
  getOrganizerEvents,
  publishEvent,
  submitEventForReview,
  takeDownOwnEvent,
  withdrawEventFromReview,
} from "../../api/events.js";
import { getMonthlyRevenue } from "../../api/bookings.js";
import { RevenueChart } from "../../components/RevenueChart.jsx";

/**
 * Confirmed booking value per month, for the twelve months ending this one.
 *
 * Rolling rather than calendar-year: in January a year-to-date chart is one
 * bar and eleven blanks, which reads as broken rather than as early.
 *
 * This is deliberately NOT the same number as salesSummary's revenue. That one
 * is sold seats times price, taken from inventory state with no dates attached
 * - a lifetime total. This one is dated booking value, which is the only thing
 * that can be put on a time axis at all. They are labelled differently on the
 * page because they measure different things, and showing both as "revenue"
 * invites the reader to spot a discrepancy that is not one.
 */
/**
 * Revenue for one event, from the response itself.
 *
 * Sold seats times their tier price, plus sold zone capacity times its price -
 * the same arithmetic the mock's salesSummary did, on data EventResponse
 * already carries. That is why the dashboard needed no summary endpoint: the
 * numbers were in the event payload the whole time.
 */
function revenueOf(event) {
  const fromSeats = (event.seat_classes || []).reduce(
    (a, c) => a + (c.sold_count || 0) * (c.price_usd_cents || 0),
    0,
  );
  const fromZones = (event.zones || []).reduce(
    (a, z) => a + (z.sold_qty || 0) * (z.price_usd_cents || 0),
    0,
  );
  return fromSeats + fromZones;
}

export default function OrganizerDashboardPage() {
  const { t, locale, date } = useLocale();
  useDocumentTitle(t("organizerDashboard"));
  const { organizerProfile } = useAuth();

  const [events, setEvents] = useState([]);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Named so the row menu can re-run it after a transition: the status, the
  // available actions and the totals all change together, and refetching is
  // cheaper to reason about than patching one row in place.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const navigate = useNavigate();

  /*
   * Which slice of the list to show. Upcoming by default.
   *
   * A dashboard is a place you open to see what needs doing, and a finished
   * event needs nothing - it just pushes the one selling tickets tomorrow
   * further down the page. Hiding them beats the alternative that keeps coming
   * up, which is flipping an expired event to TAKEN_DOWN: that is a moderation
   * verb, it would tell the organiser an admin pulled their event, and it would
   * change no behaviour at all because verifyEventIsOnSale already checks the
   * clock.
   *
   * A filter, not a deletion - the count below says how many are hidden, and
   * one click brings them back.
   */
  const [scope, setScope] = useState("upcoming");
  const [chartMetric, setChartMetric] = useState("revenue");

  /*
   * "Past" means the event has happened, not that its sales window shut.
   *
   * An event whose sales closed last week but which happens tomorrow is the
   * most active thing on this list - the organiser is about to run it. Keying
   * on starts_at is the same line salesState draws, and the same one the seed
   * draws, so all three agree on what "over" means.
   */
  const pastCount = events.filter(isPast).length;
  const shown =
    scope === "all"
      ? events
      : events.filter((e) => (scope === "past" ? isPast(e) : !isPast(e)));

  /*
   * Ten to a page rather than the twenty-five the admin tables use. These rows
   * are two lines tall and carry a progress bar each, so ten of them already
   * fill a laptop screen - and an organiser reads this list looking for one
   * event they have in mind, not scanning a ledger.
   *
   * Keyed on the scope tab: Upcoming, Past and All are three different lists,
   * so switching starts at the first page of the new one.
   */
  const paged = usePaging(shown, scope, 10);

  /**
   * Open a row, unless the click was aimed at something inside it.
   *
   * <p>Without the closest() check the row would hijack its own controls: the
   * actions menu would navigate away the moment it was opened, and the title
   * link would fire twice.
   */
  function openEvent(ev, eventId) {
    if (ev.target.closest('a, button, [role="menu"]')) return;
    navigate(`/organizer/events/${eventId}/sales`);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getOrganizerEvents(), getMonthlyRevenue(12)])
      .then(([evts, revenue]) => {
        if (cancelled) return;
        setEvents(evts || []);
        setMonths(revenue || []);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.status === 403 ? "forbidden" : "unreachable");
        setEvents([]);
        setMonths([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // capacity / sold / held come straight off EventResponse - the server already
  // sums seat classes and zones, so the old inventorySummary() lookup against
  // db.eventSeats has no job left.
  const totals = events.reduce(
    (acc, e) => ({
      revenue: acc.revenue + revenueOf(e),
      sold: acc.sold + (e.total_sold || 0),
      capacity: acc.capacity + (e.total_capacity || 0),
      held: acc.held + (e.total_held || 0),
    }),
    { revenue: 0, sold: 0, capacity: 0, held: 0 },
  );

  const booked12 = months.reduce((a, m) => a + m.cents, 0);
  const totalBookings12 = months.reduce((a, m) => a + (m.bookings || 0), 0);
  const avgTicket = totals.sold ? Math.round(totals.revenue / totals.sold) : 0;

  // Ranked by money, not ticket count. Those orders disagree whenever prices
  // differ: a fun run selling 260 cheap tickets outranks a summit selling 84
  // expensive ones on volume while earning a fraction as much, and an organiser
  // reading "top events" is asking which ones pay.
  const byRevenue = events
    .map((e) => ({
      event: e,
      sold: e.total_sold || 0,
      capacity: e.total_capacity || 0,
      revenue: revenueOf(e),
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const revenuePeak = Math.max(...byRevenue.map((r) => r.revenue), 1);

  const km = locale === "km";

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t("organizerDashboard")}</h1>
          <p>
            {organizerProfile
              ? km
                ? organizerProfile.org_name_km
                : organizerProfile.org_name_en
              : km
                ? "ព្រឹត្តិការណ៍ទាំងអស់"
                : "All organizers"}
          </p>
        </div>
        <div className="row row-tight">
          <Link className="btn btn-outline" to="/organizer/venues">
            <Icon name="building" size={16} />
            {t("venues")}
          </Link>
          <Link className="btn btn-primary" to="/organizer/events/new">
            <Icon name="plus" size={16} />
            {t("createEvent")}
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-surface border border-danger/30 rounded-card shadow-card p-6 text-center mb-4">
          <Icon name="alert" size={26} className="text-danger" />
          <p className="text-ink font-semibold mt-2 mb-1">
            {error === "forbidden"
              ? km
                ? "គណនីនេះមិនមែនជាអ្នករៀបចំ"
                : "Not an organizer account"
              : km
                ? "មិនអាចទាក់ទងម៉ាស៊ីនបម្រើ"
                : "Could not reach the server"}
          </p>
          <p className="text-small text-muted m-0">
            {error === "forbidden"
              ? km
                ? "គណនីនេះគ្មានទម្រង់អ្នករៀបចំ"
                : "This account has no organizer profile."
              : km
                ? "ពិនិត្យថា API កំពុងដំណើរការ"
                : "Check that the API is running, then reload."}
          </p>
        </div>
      )}

      {loading && !error && <OrganizerDashboardSkeleton />}

      <div
        className={`grid gap-4 lg:grid-cols-3 ${loading || error ? "hidden" : ""}`}
      >
        {/* ------------------------------------------------ Row 1: Left (Chart) */}
        <section className="lg:col-span-2 bg-surface border border-line rounded-card shadow-card p-5 flex flex-col justify-between h-full">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h2 className="text-muted text-small font-semibold m-0">
                {chartMetric === "revenue"
                  ? km
                    ? "ចំណូលបានបញ្ជាក់"
                    : "Confirmed bookings"
                  : km
                    ? "ចំនួនការកក់សរុប"
                    : "Total bookings"}
              </h2>
              <div className="text-3xl font-black tracking-tight text-ink mt-1">
                {chartMetric === "revenue"
                  ? usd(booked12)
                  : `${totalBookings12.toLocaleString()} ${km ? "ការកក់" : "bookings"}`}
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="inline-flex p-0.5 bg-surface-2 border border-line rounded-lg text-tiny font-semibold">
                <button
                  type="button"
                  onClick={() => setChartMetric("revenue")}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    chartMetric === "revenue"
                      ? "bg-brand-600 text-white shadow-xs font-bold"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {km ? "ចំណូល" : "Revenue"}
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric("bookings")}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    chartMetric === "bookings"
                      ? "bg-brand-600 text-white shadow-xs font-bold"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {km ? "ការកក់" : "Bookings"}
                </button>
              </div>

              <span className="badge badge-mode">
                {km ? "១២ ខែចុងក្រោយ" : "last 12 months"}
              </span>
            </div>
          </div>

          {booked12 || totalBookings12 ? (
            <RevenueChart months={months} km={km} metric={chartMetric} />
          ) : (
            <p className="text-small text-muted m-0 py-8 text-center">
              {km
                ? "មិនទាន់មានការកក់ក្នុង១២ខែចុងក្រោយ"
                : "No confirmed bookings in the last 12 months."}
            </p>
          )}
        </section>

        {/* ------------------------------------------------ Row 1: Right (4 Stats) */}
        <div className="lg:col-span-1 grid grid-cols-2 grid-rows-2 gap-4 h-full">
          <MiniStat
            icon="wallet"
            value={usd(totals.revenue)}
            label={km ? "ចំណូលសរុប" : "Lifetime revenue"}
          />
          <MiniStat
            icon="ticket"
            value={usd(avgTicket)}
            label={km ? "តម្លៃមធ្យម" : "Avg ticket"}
          />
          <MiniStat
            icon="calendar"
            value={totals.sold.toLocaleString()}
            label={km ? "សំបុត្រលក់រួច" : "Tickets sold"}
          />
          {/* Was "Checked in". Ticket scans live on the ticket tables and no
              endpoint exposes them yet, and a tile reading 0 would look like a
              quiet night rather than a missing feature. Held seats are real,
              come from the same payload, and are worth watching. */}
          <MiniStat
            icon="clock"
            value={totals.held.toLocaleString()}
            label={km ? "កំពុងកក់ទុក" : "Held now"}
          />
        </div>

        {/* ------------------------------------------------ Row 2: Left (My Events) */}
        <section className="lg:col-span-2 bg-surface border border-line rounded-card shadow-card p-5 self-start">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-base font-bold text-ink m-0">
              {t("myEvents")}
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-small text-muted">
                {events.filter((e) => e.status === "PUBLISHED").length}{" "}
                {km ? "កំពុងផ្សាយ" : "live"} · {events.length}{" "}
                {km ? "សរុប" : "total"}
              </span>

              {/* Only offered once there is something to hide. A toggle that
                  does nothing on a new organiser's first event is furniture. */}
              {pastCount > 0 && (
                <div
                  className="scope-tabs"
                  role="tablist"
                  aria-label={km ? "ចន្លោះពេល" : "Time range"}
                >
                  {[
                    [
                      "upcoming",
                      km ? "នាពេលខាងមុខ" : "Upcoming",
                      events.length - pastCount,
                    ],
                    ["past", km ? "កន្លងផុត" : "Past", pastCount],
                    ["all", km ? "ទាំងអស់" : "All", events.length],
                  ].map(([key, label, n]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={scope === key}
                      className={scope === key ? "active" : ""}
                      onClick={() => setScope(key)}
                    >
                      {label}
                      <span className="count-pill">{n}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {events.length ? (
            <ResponsiveTable>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("eventTitle")}</th>
                    <th>{t("status")}</th>
                    <th>{t("date")}</th>
                    <th>{t("ticketsSold")}</th>
                    <th>{t("revenue")}</th>
                    <th className="text-right">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.visible.map((e) => {
                    const venue = e.venue;
                    return (
                      /*
                       * The whole row opens the event, not just the title.
                       * A five-column row whose only target was one line of
                       * text meant aiming at a link to reach a page the rest
                       * of the row is already describing.
                       *
                       * onRowClick ignores clicks that started on a control -
                       * the title link and the actions menu keep their own
                       * behaviour rather than being swallowed by the row.
                       */
                      <tr
                        key={e.id}
                        className="row-clickable"
                        tabIndex={0}
                        onClick={(ev) => openEvent(ev, e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            navigate(`/organizer/events/${e.id}/sales`);
                          }
                        }}
                      >
                        <td>
                          {/* Points at the organiser's own view of the event,
                              not the public page - that one 404s for a draft,
                              which is exactly the row an organiser is most
                              likely to click. */}
                          <Link
                            to={`/organizer/events/${e.id}/sales`}
                            className="font-bold"
                          >
                            {km ? e.title_km : e.title_en}
                          </Link>
                          <div className="small muted">
                            {km ? venue?.name_km : venue?.name_en} ·{" "}
                            {e.inventory_mode}
                          </div>
                        </td>
                        <td>
                          <Badge status={displayStatus(e)} />
                          {/* The second half of the answer. The lifecycle
                              badge says what the organiser decided; this says
                              what is happening now. Stacked rather than
                              side-by-side so a narrow column does not push
                              the date out of line. */}
                          {(() => {
                            const state = salesState(e);
                            // The badge says "Finished" already.
                            if (!state || state === "over") return null;
                            const ui = SALES_UI[state];
                            return (
                              <div className={`sales-pill ${ui.tone}`}>
                                {km ? ui.km : ui.en}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="small">{date(e.starts_at)}</td>
                        <td>
                          <div className="small font-bold">
                            {e.total_sold} / {e.total_capacity}
                            {e.total_held ? (
                              <span className="muted">
                                {" "}
                                · {e.total_held} held
                              </span>
                            ) : null}
                          </div>
                          <Progress
                            sold={e.total_sold}
                            held={e.total_held}
                            capacity={e.total_capacity}
                          />
                        </td>
                        <td className="num font-bold">{usd(revenueOf(e))}</td>
                        <td className="text-right">
                          <RowMenu event={e} onChanged={reload} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          ) : (
            <Empty
              icon="calendar"
              title={km ? "គ្មានព្រឹត្តិការណ៍" : "No events yet"}
            >
              <Link
                className="btn btn-sm btn-primary"
                to="/organizer/events/new"
              >
                {t("createEvent")}
              </Link>
            </Empty>
          )}

          {/* Ten per page: these rows are two lines tall with a progress bar
              each, so ten already fill a laptop screen. */}
          {shown.length > 0 && (
            <TablePager
              page={paged.page}
              pages={paged.pageCount}
              pageSize={paged.pageSize}
              onPage={paged.setPage}
              onPageSize={paged.setPageSize}
              sizes={[10, 20, 30]}
            />
          )}
        </section>

        {/* ------------------------------------------------ Row 2: Right (Revenue by event) */}
        <section className="lg:col-span-1 bg-surface border border-line rounded-card shadow-card p-5 self-start">
          <h2 className="text-base font-bold text-ink m-0 mb-4">
            {km ? "ចំណូលតាមព្រឹត្តិការណ៍" : "Revenue by event"}
          </h2>
          {byRevenue.length ? (
            <div className="flex flex-col gap-3.5">
              {byRevenue.map(({ event, sold, capacity, revenue }, i) => (
                <div key={event.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <Link
                      to={`/organizer/events/${event.id}/sales`}
                      className="text-small font-semibold truncate"
                    >
                      {km ? event.title_km : event.title_en}
                    </Link>
                    <span className="text-small font-bold text-ink whitespace-nowrap tabular-nums">
                      {usd(revenue)}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full bg-surface-2 overflow-hidden"
                    title={`${usd(revenue)} · ${sold}/${capacity} ${km ? "សំបុត្រ" : "tickets"}`}
                  >
                    <div
                      /* Colour is the rank, not the event: position 1 is
                         always bar-1, so the eye can compare lengths without
                         first decoding a legend. */
                      className={`h-full rounded-full bar-${i + 1}`}
                      style={{ width: `${(revenue / revenuePeak) * 100}%` }}
                    />
                  </div>
                  {/* Volume stays visible underneath: it is what explains a
                      short bar on a busy event, or a long one on a quiet one. */}
                  <div className="text-tiny text-muted mt-1 tabular-nums">
                    {sold.toLocaleString()} / {capacity.toLocaleString()}{" "}
                    {km ? "សំបុត្រ" : "tickets"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-small text-muted m-0">
              {km ? "មិនទាន់មានទិន្នន័យ" : "Nothing sold yet."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * How each action is presented. Keyed by the transition name the server sends
 * in available_actions, so adding an edge server-side surfaces here as soon as
 * it has a label - and an unlabelled one is skipped rather than rendered raw.
 *
 * `danger` marks the moves that take an event off sale, so they can be styled
 * apart and pushed below a divider instead of sitting at the same weight as
 * "Edit".
 */
/**
 * Label and icon per transition. A presentation table, not a permission table -
 * the server decides which actions reach this page.
 */
const ACTION_UI = {
  SUBMIT: {
    icon: "arrowRight",
    en: "Submit for review",
    km: "ដាក់ស្នើត្រួតពិនិត្យ",
    call: submitEventForReview,
  },
  WITHDRAW: {
    icon: "arrowLeft",
    en: "Withdraw",
    km: "ដកសំណើវិញ",
    call: withdrawEventFromReview,
  },
  PUBLISH: {
    icon: "check",
    en: "Publish",
    km: "ផ្សព្វផ្សាយ",
    call: publishEvent,
  },
  /*
   * The organiser's own take-down, not the admin's. It reaches this menu only
   * while nothing has sold - the server drops TAKE_DOWN from available_actions
   * from the first ticket onward, because pulling a show people hold tickets to
   * is a money-back decision rather than a listing one.
   *
   * Confirmed before it runs, and marked danger, because the organiser cannot
   * undo it: reopening a taken-down event is admin-only, deliberately, so that
   * an admin's moderation cannot be reversed by the person it was aimed at.
   */
  TAKE_DOWN: {
    icon: "alert",
    en: "Take off sale",
    km: "ដកចេញពីការលក់",
    danger: true,
    confirm: true,
    call: takeDownOwnEvent,
  },
};

/**
 * One gear per row instead of three buttons.
 *
 * Three visible buttons per row is nine controls on a nine-event table, and the
 * destructive one sat in the same weight as the others - a mis-click away from
 * pulling a live event. Folding them into a menu makes the row scannable and
 * puts a deliberate second step in front of the one action that cannot be
 * undone from here.
 */
function RowMenu({ event, onChanged }) {
  const { t, locale } = useLocale();
  const km = locale === "km";
  const toast = useToast();

  /*
   * The action waiting on a yes. Holds the transition name for a confirmable
   * one, or 'DELETE' for the removal - which is not a transition at all and so
   * never appears in available_actions.
   */
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(fn, done) {
    setBusy(true);
    try {
      await fn(event.id);
      toast(done, "success");
      onChanged();
    } catch (e) {
      // The server refuses actions this menu should never have offered.
      // Surfacing its message rather than a generic one means a disagreement
      // between the two is visible instead of looking like a dead button.
      toast(e?.response?.data?.detail || "Action failed", "error");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  /*
   * Removal is offered on anything that has never sold.
   *
   * total_sold is a stand-in for the server's real rule, which counts BOOKINGS
   * in any state - an expired one leaves no sale but does leave a row, and the
   * delete is refused for it. So this can be offered where it will be refused,
   * and the refusal says why. The same "hint, not authorization" relationship
   * the admin table's deletable flag has.
   */
  const canRemove = (event.total_sold ?? 0) === 0;

  // The server sends only what this caller may do, so there is no permission
  // rule here - just a guard against an action that has no label yet, which
  // renders nothing rather than a raw enum name.
  const actions = (event.available_actions || []).filter((a) => ACTION_UI[a]);

  /*
   * The one action worth a button of its own on the row.
   *
   * Everything used to sit behind the gear, which is right for five actions and
   * wrong for the one the row is actually waiting on: an approved event exists
   * to be published, and a draft to be submitted, and neither should need a
   * menu opened to find out. So the forward-moving action comes out onto the
   * row and the rest stay in the menu.
   *
   * Deliberately only these two. WITHDRAW moves an event backwards, and
   * TAKE_DOWN and Remove are destructive - none of them should be one stray
   * click away in a table row, which is the reason the menu exists at all.
   */
  const primary = actions.includes("PUBLISH")
    ? "PUBLISH"
    : actions.includes("SUBMIT")
      ? "SUBMIT"
      : null;
  // Short on the row, full in the toast that confirms it happened.
  const PRIMARY_LABEL = { PUBLISH: t("publish"), SUBMIT: t("submitShort") };
  const PRIMARY_DONE = {
    PUBLISH: km ? "ព្រឹត្តិការណ៍ត្រូវបានផ្សាយ" : "Event published",
    SUBMIT: km ? "បានដាក់ស្នើត្រួតពិនិត្យ" : "Submitted for review",
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {/* On the row, not in the menu - see `primary` above. */}
      {primary && (
        <button
          type="button"
          className="btn btn-sm btn-primary whitespace-nowrap"
          disabled={busy}
          onClick={() => run(ACTION_UI[primary].call, PRIMARY_DONE[primary])}
        >
          {PRIMARY_LABEL[primary]}
        </button>
      )}

      <ActionMenu
        disabled={busy}
        label={km ? "សកម្មភាព" : "Actions"}
        items={[
          // Edit goes once the event has happened: the API refuses the PATCH
          // from that point, so leaving it here only led to an error at the
          // end of a filled-in form. Sales and the public page stay - both
          // are still worth reading afterwards.
          {
            key: "edit",
            icon: "edit",
            label: t("editEvent"),
            hidden: isPast(event),
            to: `/organizer/events/${event.id}/edit`,
          },
          {
            key: "sales",
            icon: "chart",
            label: t("sales"),
            to: `/organizer/events/${event.id}/sales`,
          },
          {
            key: "view",
            icon: "eye",
            label: km ? "មើលទំព័រសាធារណៈ" : "View public page",
            to: `/events/${event.id}`,
          },
          // Rendered from the server's own answer rather than guessed from the
          // status. A two-state guess offered "Publish" on a REJECTED event,
          // which the API refuses - and could never learn about a new edge.
          ...actions
            .filter((a) => a !== primary)
            .map((action) => {
              const ui = ACTION_UI[action];
              return {
                key: action,
                icon: ui.icon,
                label: km ? ui.km : ui.en,
                tone: ui.danger ? "danger" : undefined,
                onSelect: () => {
                  // Destructive ones ask first; the rest are one click, as
                  // they were - a submit or a publish is undone by
                  // withdrawing.
                  if (ui.confirm) setConfirming(action);
                  else run(ui.call, km ? "រួចរាល់" : "Done");
                },
              };
            }),
          // Not a transition, so it is not in available_actions and cannot
          // come from ACTION_UI. The server refuses it for anything ever
          // booked, which is what makes it the organiser's to do: what is
          // left is the draft, the rejection and the duplicate posted twice.
          {
            key: "remove",
            icon: "close",
            label: km ? "លុបចោល" : "Remove",
            tone: "danger",
            hidden: !canRemove,
            onSelect: () => setConfirming("DELETE"),
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(confirming)}
        tone="danger"
        busy={busy}
        title={
          confirming === "DELETE"
            ? km
              ? "លុបព្រឹត្តិការណ៍នេះ?"
              : "Remove this event?"
            : km
              ? "ដកចេញពីការលក់?"
              : "Take this event off sale?"
        }
        confirmLabel={
          confirming === "DELETE"
            ? km
              ? "លុបចោល"
              : "Remove"
            : km
              ? "ដកចេញ"
              : "Take off sale"
        }
        onConfirm={() => {
          if (confirming === "DELETE") {
            run(deleteOwnEvent, km ? "បានលុបចោល" : "Event removed");
          } else {
            run(
              ACTION_UI[confirming].call,
              km ? "បានដកចេញពីការលក់" : "Taken off sale",
            );
          }
        }}
        onClose={() => setConfirming(null)}
      >
        <p className="small muted">
          {confirming === "DELETE"
            ? km
              ? "ព្រឹត្តិការណ៍នេះ និងតំបន់ ផែនទីកៅអី និងតម្លៃរបស់វា នឹងត្រូវលុបចោលជាអចិន្ត្រៃយ៍។"
              : "This event and its zones, seat map and pricing are deleted for good. This cannot be undone."
            : km
              ? "ព្រឹត្តិការណ៍នេះនឹងបាត់ពីការស្វែងរក។ មានតែអ្នកគ្រប់គ្រងទេដែលអាចដាក់លក់វិញបាន។"
              : "It disappears from the catalogue and stops selling. Only a platform admin can put it back on sale, so ask one if you change your mind."}
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Number first, label under it, icon quiet in the corner. */
function MiniStat({ icon, value, label }) {
  return (
    <div className="bg-surface border border-line rounded-card shadow-card p-4 flex flex-col justify-between gap-4 h-full">
      <div className="text-xl font-bold tracking-tight text-ink tabular-nums">
        {value}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-tiny text-muted font-medium leading-tight">
          {label}
        </span>
        <span className="w-8 h-8 rounded-full bg-surface-2 border border-line-2 flex items-center justify-center text-muted shrink-0">
          <Icon name={icon} size={15} />
        </span>
      </div>
    </div>
  );
}
