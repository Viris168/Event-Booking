import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon.jsx";
import {
  Alert,
  Badge,
  Empty,
  ResponsiveTable,
  Stat,
} from "../../components/ui.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { timeAgo, usd } from "../../lib/format.js";
import { SALES_UI, displayStatus, salesState } from "../../lib/salesState.js";
import { useProvinces } from "../../lib/useProvinces.js";
import { getPlatformStats, getRecentEvents } from "../../api/admin.js";

/*
 * Platform overview, from the database.
 *
 * The counters used to be derived in the browser by walking mock/store.js's
 * arrays. Two requests replace that: one aggregate for the tiles and one small
 * page of events for the strip. The stuck-payment count comes from the
 * aggregate rather than by fetching the payments and measuring the array -
 * whether an attempt is stuck is a question about elapsed time, and the server
 * is the one holding a clock anybody has looked at recently.
 *
 * The strip lists events rather than bookings. Both are a feed of what just
 * happened, but only one of them is this screen's job: a booking is somebody
 * else's money moving and /admin/payments is built to read it, while a new
 * listing is the thing an admin is expected to act on - the queue tiles above
 * count the ones waiting, and this says what they are.
 */
const EMPTY_STATS = {
  users: 0,
  customers: 0,
  organizers: 0,
  disabled: 0,
  events: 0,
  published: 0,
  drafts: 0,
  pending_review: 0,
  taken_down: 0,
  bookings: 0,
  confirmed: 0,
  awaiting_confirmation: 0,
  gross_usd_cents: 0,
  gross_30d_usd_cents: 0,
  tickets_issued: 0,
  checked_in: 0,
  stuck_payments: 0,
  pending_applications: 0,
  on_sale_now: 0,
  payouts_to_send: 0,
  payouts_to_send_usd_cents: 0,
};

export default function AdminDashboardPage() {
  const { t, locale, date, dateTime } = useLocale();
  const km = locale === "km";
  useDocumentTitle(t("adminDashboard"));

  // From the hook rather than written again here: it already falls back to the
  // raw code for a province the list does not know, which makes a data problem
  // visible instead of blank.
  const { provinceName } = useProvinces();

  const [stats, setStats] = useState(EMPTY_STATS);
  const [recent, setRecent] = useState([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([getPlatformStats(), getRecentEvents(8)])
      .then(([s, r]) => {
        if (!live) return;
        setLoadError(false);
        setStats(s ?? EMPTY_STATS);
        setRecent(Array.isArray(r) ? r : []);
      })
      .catch(() => {
        if (!live) return;
        setLoadError(true);
        setStats(EMPTY_STATS);
        setRecent([]);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <div className="page-title-lockup">
            <span className="icon-chip green lg">
              <Icon name="shield" size={22} />
            </span>
            <h1>{t("adminDashboard")}</h1>
          </div>
          <p>
            {km
              ? "ទិដ្ឋភាពទូទៅនៃវេទិកា — អ្នកប្រើ ព្រឹត្តិការណ៍ ការទូទាត់។"
              : "Platform-wide view of users, events and money movement."}
          </p>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" style={{ marginBottom: "1.2rem" }}>
          {km
            ? "មិនអាចផ្ទុកទិន្នន័យវេទិកាបានទេ។"
            : "Could not load platform data. The figures below are not live."}
        </Alert>
      )}

      {/*
       * The two things that are usually not true.
       *
       * Both of these used to be tiles, which meant a sixth of the strip was
       * permanently occupied by a pair of zeros - and on the rare day one of
       * them was not zero, the tile said so in a number while the banner below
       * said so again in a sentence. As alerts they cost nothing when there is
       * nothing wrong, and when there is, each arrives with the way to fix it.
       */}
      {stats.stuck_payments > 0 && (
        <div style={{ marginBottom: "1.2rem" }}>
          <Alert
            tone="warn"
            title={`${stats.stuck_payments} ${t("stuckPayments").toLowerCase()}`}
            actions={
              <Link
                className="btn btn-sm btn-outline"
                to="/admin/payments?stuck=1"
              >
                {t("payments")}
                <Icon name="arrowRight" size={14} />
              </Link>
            }
          >
            {km
              ? "ការទូទាត់ទាំងនេះមិនបានទទួល webhook ទេ។ ត្រូវផ្ទៀងផ្ទាត់ដោយដៃ។"
              : "These attempts never received a provider webhook and need manual reconciliation."}
          </Alert>
        </div>
      )}

      {stats.awaiting_confirmation > 0 && (
        <div style={{ marginBottom: "1.2rem" }}>
          <Alert
            tone="info"
            title={`${stats.awaiting_confirmation} ${t("reconciliation").toLowerCase()}`}
            actions={
              <Link className="btn btn-sm btn-outline" to="/admin/payments">
                {t("payments")}
                <Icon name="arrowRight" size={14} />
              </Link>
            }
          >
            {km
              ? "ការកក់ទាំងនេះបានបង់ប្រាក់ ប៉ុន្តែរង់ចាំការបញ្ជាក់។"
              : "These bookings have been paid for and are waiting on a confirmation."}
          </Alert>
        </div>
      )}

      {/*
       * Work first, then the platform.
       *
       * The first three tiles are queues with somebody's name on them, and
       * each one is a link to the screen that clears it. The last three are
       * reporting - true, worth knowing, and nothing to do about.
       *
       * What used to be here was six reporting tiles, two of which were alarms
       * reading 0 almost always. Those two moved up into the alerts above,
       * which is where a thing that is only sometimes true belongs.
       */}
      <div className="stats" style={{ marginBottom: "1.2rem" }}>
        <Stat
          icon="shield"
          to="/admin/review"
          label={km ? "រង់ចាំត្រួតពិនិត្យ" : "Needs review"}
          value={stats.pending_review}
          sub={km ? "ព្រឹត្តិការណ៍ដាក់ស្នើ" : "events submitted for a decision"}
          alert={stats.pending_review > 0}
        />
        <Stat
          icon="user"
          to="/admin/applications"
          label={km ? "ពាក្យសុំរង់ចាំ" : "Applications"}
          value={stats.pending_applications}
          sub={km ? "អ្នកសុំធ្វើជាអ្នករៀបចំ" : "waiting to become organisers"}
          alert={stats.pending_applications > 0}
        />
        <Stat
          icon="bank"
          to="/admin/payouts"
          label={km ? "ត្រូវទូទាត់" : "Payouts to send"}
          value={stats.payouts_to_send}
          /* The money, not a second count: how much is owed is the part that
             decides whether this is today's job or this week's. */
          sub={`${usd(stats.payouts_to_send_usd_cents)} ${km ? "ជំពាក់អ្នករៀបចំ" : "owed to organisers"}`}
          alert={stats.payouts_to_send > 0}
        />
        <Stat
          icon="wallet"
          tone="green"
          label={km ? "ចំណូល ៣០ ថ្ងៃ" : "Collected, 30 days"}
          /* The window, with the lifetime figure demoted to the sub-line. The
             tile used to print the all-time total twice over - once as the
             value and once again underneath - and an all-time total only goes
             up, so it could not tell a good month from a dead one. */
          value={usd(stats.gross_30d_usd_cents)}
          sub={`${usd(stats.gross_usd_cents)} ${km ? "សរុបតាំងពីដើម" : "all time"}`}
        />
        <Stat
          icon="calendar"
          label={km ? "កំពុងលក់" : "On sale now"}
          /* Not the raw event count. Publishing never expires, so that number
             folded in every show that finished last year and could only ever
             rise; this one is what is actually selling today. */
          value={stats.on_sale_now}
          sub={`${stats.events} ${km ? "សរុប" : "events in total"} · ${stats.published} ${
            km ? "បានផ្សាយ" : "published"
          }`}
        />
        <Stat
          icon="users"
          label={t("users")}
          value={stats.users}
          sub={`${stats.customers} customers · ${stats.organizers} organizers${
            stats.disabled ? ` · ${stats.disabled} disabled` : ""
          }`}
        />
      </div>

      {/* Full width rather than .split: that grid reserves a fixed 340px
          second column, which stood empty once the Jump-to card went - the
          nav rail already reaches every one of those four screens. */}
      <div className="panel">
        <div className="panel-head">
          <h2>{km ? "ព្រឹត្តិការណ៍ថ្មីៗ" : "Recent events"}</h2>
          <Link className="small with-icon" to="/admin/events">
            {t("moderation")}
            <Icon name="arrowRight" size={14} />
          </Link>
        </div>
        {recent.length === 0 && !loadError ? (
          <div className="panel-body">
            <Empty
              icon="calendar"
              title={km ? "មិនទាន់មានព្រឹត្តិការណ៍ទេ" : "No events yet"}
            >
              {km
                ? "ព្រឹត្តិការណ៍ដែលអ្នករៀបចំដាក់ស្នើនឹងបង្ហាញនៅទីនេះ។"
                : "Listings appear here as organisers submit them."}
            </Empty>
          </div>
        ) : (
          <ResponsiveTable>
            <table className="table">
              <thead>
                <tr>
                  <th>{km ? "ព្រឹត្តិការណ៍" : "Event"}</th>
                  <th>{t("organizer")}</th>
                  <th>{t("status")}</th>
                  <th>{km ? "កាលបរិច្ឆេទ" : "Date"}</th>
                  <th>{km ? "បានបង្កើត" : "Added"}</th>
                </tr>
              </thead>
              <tbody>
                {/* The tint follows the badge rather than the stored status,
                    the same way the moderation table does it - a finished
                    event reads "Finished" whatever it was taken down from. */}
                {recent.map((e) => (
                  <tr
                    key={e.id}
                    className={
                      displayStatus(e) === "TAKEN_DOWN" ? "flagged" : ""
                    }
                  >
                    <td>
                      <Link to={`/events/${e.id}`} className="font-bold">
                        {km ? e.title_km : e.title_en}
                      </Link>
                      <div className="small muted">
                        {km ? e.venue_name_km : e.venue_name_en} ·{" "}
                        {provinceName(e.province_code, locale)}
                      </div>
                    </td>
                    <td className="small">
                      {(km ? e.organizer_name_km : e.organizer_name_en) || "—"}
                    </td>
                    <td>
                      <Badge status={displayStatus(e)} />
                      {/* What the lifecycle badge cannot say: whether the
                          thing is actually taking money right now. "Finished"
                          is already on the badge, so no pill there. */}
                      {(() => {
                        const state = salesState(e);
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
                    <td className="small muted" title={dateTime(e.created_at)}>
                      {timeAgo(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </div>
    </div>
  );
}
