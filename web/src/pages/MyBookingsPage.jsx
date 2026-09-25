import { useDocumentTitle } from "../lib/useDocumentTitle.js";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { CATEGORY_ICON } from "../components/Icon.jsx";
import {
  BookingListSkeleton,
  EventCardSkeleton,
  Skeleton,
} from "../components/Skeleton.jsx";
import { Badge, Empty, Money } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { eventArt } from "../lib/eventArt.js";
import { ticketsExpired } from "../lib/ticketExpiry.js";
import { getMyBookings } from "../api/bookings.js";
import { getEvent as getApiEvent } from "../api/events.js";
import { getBookingTickets } from "../api/tickets.js";
import { mapBooking, mapEvent, mapTicket } from "../api/adapters.js";

/** States in which a booking has tickets worth counting. */
const TICKETED = ["CONFIRMED"];

/**
 * States the buyer can still act on, mirroring PaymentService.PAYABLE on the
 * server. Surfacing these as a button on the row is the point of this page:
 * an unpaid booking is the one thing here that expires if ignored.
 */
const PAYABLE = ["PENDING_PAYMENT", "AWAITING_CONFIRMATION", "PAYMENT_FAILED"];

/** Dead states — kept visible for the record, but styled as spent. */
const CLOSED = ["EXPIRED", "CANCELLED"];

const STATES = [
  "PENDING_PAYMENT",
  "AWAITING_CONFIRMATION",
  "PAYMENT_FAILED",
  "CONFIRMED",
  "EXPIRED",
  "CANCELLED",
];

/**
 * Both of these live at module scope, not inside MyBookingsPage. A component
 * declared during render is a fresh type on every render, so React unmounts and
 * remounts the whole subtree each time — losing DOM state and re-fetching the
 * row images. The lookup maps come down as props instead of via closure.
 */
function Row({ booking, event, ticketCount }) {
  const { locale, date, dateTime } = useLocale();
  const items = booking.items ?? [];
  const units = items.reduce((a, i) => a + (i.qty ?? 0), 0);
  const art = eventArt(event, "banner");
  const payable = PAYABLE.includes(booking.state);
  const closed = CLOSED.includes(booking.state);

  const stats =
    typeof ticketCount === "object" && ticketCount !== null
      ? ticketCount
      : { total: ticketCount || 0, used: 0, allUsed: false };
  const { total, used, allUsed } = stats;
  // Confirmed, but the event's day is over: whatever was not scanned can no
  // longer get anyone in, so it reads as spent rather than as a live ticket.
  const expired =
    booking.state === "CONFIRMED" && !allUsed && ticketsExpired(event);

  return (
    <Link
      to={`/bookings/${booking.id}`}
      className={`bk-row${closed || expired ? " is-closed" : ""}${payable ? " is-payable" : ""}${allUsed ? " is-used" : ""}`}
    >
      {/* Same artwork resolution as the event cards, so a booking is
          recognisable by the picture you bought it from. */}
      <span
        className={`bk-art ${art.className}${art.hasImage ? " has-photo" : ""}`}
      >
        {art.hasImage ? (
          <img
            className="ev-photo"
            src={art.url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.remove();
            }}
          />
        ) : (
          <Icon
            name={CATEGORY_ICON[event?.category] || "ticket"}
            size={22}
            strokeWidth={1.5}
            className="cat-icon"
          />
        )}
      </span>

      <span className="bk-main">
        <span className="row row-tight">
          {allUsed ? (
            <span className="badge badge-used">
              <Icon name="checkCircle" size={11} />
              {locale === "km" ? "បានប្រើរួច" : "Used"}
            </span>
          ) : expired ? (
            <Badge status="EXPIRED" />
          ) : (
            <>
              <Badge status={booking.state} />
              {used > 0 ? (
                <span className="badge badge-partial">
                  <Icon name="checkCircle" size={11} />
                  {used}/{total} {locale === "km" ? "បានប្រើ" : "used"}
                </span>
              ) : null}
            </>
          )}
          <span className="mono small muted">{booking.booking_ref}</span>
        </span>

        {/* The event read can still be in flight, or have failed; the ref
            above already identifies the row, so an em dash beats blanking. */}
        <span className="bk-title">
          {(locale === "km" ? event?.title_km : event?.title_en) ?? "—"}
        </span>

        <span className="bk-meta">
          <span className="meta-row">
            <Icon name="calendar" size={14} />
            <span>{event?.starts_at ? dateTime(event.starts_at) : "—"}</span>
          </span>
          <span className="meta-row">
            <Icon
              name={allUsed ? "checkCircle" : "ticket"}
              size={14}
              className={allUsed ? "text-muted" : ""}
            />
            <span>
              {units}{" "}
              {locale === "km" ? "ឯកតា" : units === 1 ? "ticket" : "tickets"}
              {allUsed ? (
                <>
                  {" · "}
                  <span className="font-semibold text-muted">
                    {locale === "km" ? "បានប្រើទាំងអស់" : "All used"}
                  </span>
                </>
              ) : expired ? (
                <>
                  {" · "}
                  <span className="font-semibold text-muted">
                    {locale === "km" ? "ផុតកំណត់" : "Expired"}
                  </span>
                </>
              ) : used > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium text-warning">
                    {used}/{total} {locale === "km" ? "បានប្រើ" : "used"}
                  </span>
                </>
              ) : total ? (
                ` · ${total} QR`
              ) : (
                ""
              )}
            </span>
          </span>
        </span>
      </span>

      <span className="bk-side">
        <Money cents={booking.total_usd_cents} stacked />
        <span className="small muted">
          {locale === "km" ? "កក់ថ្ងៃ" : "booked"} {date(booking.created_at)}
        </span>
        {payable && (
          <span className="btn btn-sm btn-accent bk-pay">
            {locale === "km" ? "បង់ប្រាក់" : "Pay now"}
            <Icon name="arrowRight" size={13} />
          </span>
        )}
      </span>
    </Link>
  );
}

function GridCard({ booking, event, ticketCount }) {
  const { locale, date, dateTime } = useLocale();
  const items = booking.items ?? [];
  const units = items.reduce((a, i) => a + (i.qty ?? 0), 0);
  const art = eventArt(event, "banner");
  const payable = PAYABLE.includes(booking.state);
  const closed = CLOSED.includes(booking.state);

  const stats =
    typeof ticketCount === "object" && ticketCount !== null
      ? ticketCount
      : { total: ticketCount || 0, used: 0, allUsed: false };
  const { total, used, allUsed } = stats;
  // Confirmed, but the event's day is over: whatever was not scanned can no
  // longer get anyone in, so it reads as spent rather than as a live ticket.
  const expired =
    booking.state === "CONFIRMED" && !allUsed && ticketsExpired(event);

  const startDate = event?.starts_at ? new Date(event.starts_at) : null;
  const month = startDate
    ? startDate
        .toLocaleDateString(locale === "km" ? "km-KH" : "en-US", {
          month: "short",
        })
        .toUpperCase()
    : null;
  const day = startDate ? startDate.getDate() : null;

  const venue = event?.venue;
  const venueName =
    locale === "km"
      ? (venue?.nameKm ?? venue?.name_km)
      : (venue?.nameEn ?? venue?.name_en);

  return (
    <Link
      to={`/bookings/${booking.id}`}
      className={`bk-card${closed || expired ? " is-closed" : ""}${payable ? " is-payable" : ""}${allUsed ? " is-used" : ""}`}
    >
      <div
        className={`bk-card-media ${art.className}${art.hasImage ? " has-photo" : ""}`}
      >
        {art.hasImage ? (
          <img
            className="ev-photo"
            src={art.url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.remove();
            }}
          />
        ) : (
          <Icon
            name={CATEGORY_ICON[event?.category] || "ticket"}
            size={36}
            strokeWidth={1.5}
            className="cat-icon"
          />
        )}
        <div className="bk-card-media-scrim" />
        <div className="bk-card-badges">
          <div className="bk-card-badges-left">
            {allUsed ? (
              <span className="badge badge-used">
                <Icon name="checkCircle" size={11} />
                {locale === "km" ? "បានប្រើរួច" : "Used"}
              </span>
            ) : expired ? (
              <Badge status="EXPIRED" />
            ) : (
              <>
                <Badge status={booking.state} />
                {used > 0 ? (
                  <span className="badge badge-partial">
                    <Icon name="checkCircle" size={11} />
                    {used}/{total} {locale === "km" ? "បានប្រើ" : "used"}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <span className="bk-card-ref">
            <Icon name="ticket" size={11} />
            <span>{booking.booking_ref}</span>
          </span>
        </div>

        {startDate && (
          <span className="bk-card-date">
            <span>{month}</span>
            <b>{day}</b>
          </span>
        )}
      </div>

      <div className="bk-card-body">
        <h3 className="bk-card-title">
          {(locale === "km" ? event?.title_km : event?.title_en) ?? "—"}
        </h3>

        <div className="bk-card-meta">
          <span className="meta-row">
            <Icon name="calendar" size={13} />
            <span>{event?.starts_at ? dateTime(event.starts_at) : "—"}</span>
          </span>
          {venueName && (
            <span className="meta-row">
              <Icon name="mapPin" size={13} />
              <span className="truncate">{venueName}</span>
            </span>
          )}
          <span className="meta-row">
            <Icon
              name={allUsed ? "checkCircle" : "ticket"}
              size={13}
              className={allUsed ? "text-muted" : ""}
            />
            <span>
              {units}{" "}
              {locale === "km" ? "ឯកតា" : units === 1 ? "ticket" : "tickets"}
              {allUsed ? (
                <>
                  {" · "}
                  <span className="font-semibold text-muted">
                    {locale === "km" ? "បានប្រើទាំងអស់" : "All used"}
                  </span>
                </>
              ) : expired ? (
                <>
                  {" · "}
                  <span className="font-semibold text-muted">
                    {locale === "km" ? "ផុតកំណត់" : "Expired"}
                  </span>
                </>
              ) : used > 0 ? (
                <>
                  {" · "}
                  <span className="font-medium text-warning">
                    {used}/{total} {locale === "km" ? "បានប្រើ" : "used"}
                  </span>
                </>
              ) : total ? (
                ` · ${total} QR`
              ) : (
                ""
              )}
            </span>
          </span>
        </div>
      </div>

      <div className="bk-card-divider" aria-hidden="true">
        <svg
          className="bk-notch bk-notch-left"
          width="12"
          height="24"
          viewBox="0 0 12 24"
          fill="none"
        >
          <path d="M 0,0 A 12,12 0 0,1 0,24 Z" />
        </svg>
        <div className="bk-dashed-line" />
        <svg
          className="bk-notch bk-notch-right"
          width="12"
          height="24"
          viewBox="0 0 12 24"
          fill="none"
        >
          <path d="M 12,0 A 12,12 0 0,0 12,24 Z" />
        </svg>
      </div>

      <div className="bk-card-foot">
        <div className="bk-card-foot-price">
          <Money cents={booking.total_usd_cents} stacked />
          <span className="bk-card-booked">
            {locale === "km" ? "កក់ថ្ងៃ" : "booked"} {date(booking.created_at)}
          </span>
        </div>
        {payable ? (
          <span className="btn btn-sm btn-accent bk-pay">
            {locale === "km" ? "បង់ប្រាក់" : "Pay now"}
            <Icon name="arrowRight" size={13} />
          </span>
        ) : (
          <span className={`bk-ticket-btn${allUsed ? " is-used" : ""}`}>
            <Icon name="qr" size={13} />
            <span>{locale === "km" ? "មើលសំបុត្រ" : "View ticket"}</span>
            <Icon name="arrowRight" size={11} className="bk-ticket-btn-arrow" />
          </span>
        )}
      </div>
    </Link>
  );
}

function Group({
  title,
  icon,
  list,
  apiEvents,
  ticketCounts,
  viewMode = "list",
}) {
  if (!list.length) return null;
  return (
    <div className="bk-group">
      <div className="bk-group-head">
        {icon && <Icon name={icon} size={15} />}
        <span>{title}</span>
        <span className="bk-group-count">{list.length}</span>
      </div>
      {viewMode === "grid" ? (
        <div className="grid grid-cards">
          {list.map((b) => (
            <GridCard
              key={b.id}
              booking={b}
              event={apiEvents[b.event_id]}
              ticketCount={ticketCounts[b.id] ?? 0}
            />
          ))}
        </div>
      ) : (
        <div className="stack-sm">
          {list.map((b) => (
            <Row
              key={b.id}
              booking={b}
              event={apiEvents[b.event_id]}
              ticketCount={ticketCounts[b.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyBookingsPage() {
  const { t, locale, status } = useLocale();
  useDocumentTitle(t("myBookings"));
  const { user } = useAuth();
  const [state, setState] = useState("");
  const [bookingsData, setBookingsData] = useState([]);
  const [apiEvents, setApiEvents] = useState({});
  const [ticketCounts, setTicketCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("bookings_view_mode") || "list";
    } catch {
      return "list";
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("bookings_view_mode", mode);
    } catch {
      // storage unavailable
    }
  };

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    getMyBookings()
      .then((res) => {
        if (!active) return;
        setBookingsData(Array.isArray(res) ? res.map(mapBooking) : []);
      })
      .catch(() => {
        // Previously swallowed, which quietly fell through to the prototype
        // store — the page then showed someone else's seeded bookings as if
        // they were yours.
        if (!active) return;
        setBookingsData([]);
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, reload]);

  // Each row needs its event for the title, date and artwork. The bookings
  // endpoint carries only event_id, so events are fetched alongside —
  // deduplicated, because several bookings for one event are the normal case.
  // Line items already arrive inline, so those cost no extra request.
  useEffect(() => {
    if (!bookingsData.length) return;
    let active = true;

    const ids = [
      ...new Set(bookingsData.map((b) => b.event_id).filter(Boolean)),
    ];
    Promise.all(
      ids.map((id) =>
        getApiEvent(id)
          .then(mapEvent)
          .catch(() => null),
      ),
    ).then((list) => {
      if (!active) return;
      const byId = {};
      list.forEach((e) => {
        if (e) byId[e.id] = e;
      });
      setApiEvents(byId);
    });

    // Ticket stats drive the "N QR" badge and used status. Only asked for where tickets can
    // exist: they are issued at payment, so an unpaid booking would just cost a
    // round trip to be told nothing.
    const ticketed = bookingsData.filter((b) => TICKETED.includes(b.state));
    Promise.all(
      ticketed.map((b) =>
        getBookingTickets(b.id)
          .then((ts) => {
            const list = (ts || []).map(mapTicket);
            const used = list.filter(
              (t) => t.checked_in || Boolean(t.checked_in_at),
            ).length;
            return [
              b.id,
              {
                total: list.length,
                used,
                allUsed: list.length > 0 && used === list.length,
              },
            ];
          })
          .catch(() => [b.id, { total: 0, used: 0, allUsed: false }]),
      ),
    ).then((pairs) => {
      if (active) setTicketCounts(Object.fromEntries(pairs));
    });

    return () => {
      active = false;
    };
  }, [bookingsData]);

  const all = bookingsData;
  const counts = all.reduce(
    (acc, b) => ({ ...acc, [b.state]: (acc[b.state] || 0) + 1 }),
    {},
  );
  const filtered = state ? all.filter((b) => b.state === state) : all;

  /**
   * Split by whether the event has happened, then sort each half towards the
   * present: the next thing you must show up for sits at the top, and the
   * archive reads newest-first below it.
   *
   * An event still loading has no date yet; those sort as upcoming rather than
   * dropping into the archive and appearing to vanish.
   *
   * Within each half, bookings that need nothing more from you (cancelled,
   * expired, every ticket already scanned, or tickets whose event day is over)
   * sink below the live ones.
   */
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up = [];
    const done = [];
    for (const b of filtered) {
      const startsAt = apiEvents[b.event_id]?.starts_at;
      const ts = startsAt ? new Date(startsAt).getTime() : null;
      const inactive =
        CLOSED.includes(b.state) ||
        Boolean(ticketCounts[b.id]?.allUsed) ||
        (b.state === "CONFIRMED" && ticketsExpired(apiEvents[b.event_id], now));
      if (ts != null && ts < now) done.push([b, ts, inactive]);
      else up.push([b, ts ?? Number.MAX_SAFE_INTEGER, inactive]);
    }
    up.sort((a, z) => a[2] - z[2] || a[1] - z[1]);
    done.sort((a, z) => a[2] - z[2] || z[1] - a[1]);
    return { upcoming: up.map(([b]) => b), past: done.map(([b]) => b) };
  }, [filtered, apiEvents, ticketCounts]);

  // Signed out: nothing to fetch, and an empty "no bookings" state would be a
  // lie — the bookings may well exist, just not for an anonymous caller.
  if (!user?.id) {
    return (
      <div className="container">
        <div className="page-head">
          <h1>{t("myBookings")}</h1>
        </div>
        <Empty
          icon="user"
          title={
            locale === "km" ? "សូមចូលគណនី" : "Sign in to see your bookings"
          }
          actions={
            <Link className="btn btn-sm btn-primary" to="/login">
              {t("login")}
            </Link>
          }
        />
      </div>
    );
  }

  const payableCount = all.filter((b) => PAYABLE.includes(b.state)).length;

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <h1>{t("myBookings")}</h1>
          {loading ? (
            <Skeleton className="skel-line mt-2 w-48" />
          ) : (
            <p>
              {all.length} {locale === "km" ? "ការកក់" : "bookings"} ·{" "}
              {all.filter((b) => b.state === "CONFIRMED").length}{" "}
              {status("CONFIRMED").toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {/* Unpaid bookings expire. That is the one thing on this page worth
          interrupting for, so it sits above the filters rather than being
          something you have to notice among the rows. */}
      {!loading && !failed && payableCount > 0 && (
        <div className="bk-alert">
          <Icon name="clock" size={16} />
          <span>
            {locale === "km"
              ? `អ្នកមានការកក់ ${payableCount} រង់ចាំការបង់ប្រាក់។`
              : `${payableCount} booking${payableCount === 1 ? "" : "s"} awaiting payment — these expire if left unpaid.`}
          </span>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setState("PENDING_PAYMENT")}
          >
            {locale === "km" ? "មើល" : "Show"}
          </button>
        </div>
      )}

      {!loading && !failed && all.length > 0 && (
        <div className="bk-toolbar">
          <div className="chips">
            <button
              className={`chip ${!state ? "active" : ""}`}
              onClick={() => setState("")}
            >
              {t("allStatuses")} ({all.length})
            </button>
            {STATES.filter((s) => counts[s]).map((s) => (
              <button
                key={s}
                className={`chip ${state === s ? "active" : ""}`}
                onClick={() => setState(s)}
              >
                {status(s)} ({counts[s]})
              </button>
            ))}
          </div>

          <div
            className="bk-view-toggle"
            role="group"
            aria-label={locale === "km" ? "ប្តូរទិដ្ឋភាព" : "Switch view"}
          >
            <button
              type="button"
              className={`bk-view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => handleSetViewMode("list")}
              aria-label={locale === "km" ? "ទិដ្ឋភាពបញ្ជី" : "List view"}
              title={locale === "km" ? "ទិដ្ឋភាពបញ្ជី" : "List view"}
            >
              <Icon name="list" size={17} />
            </button>
            <button
              type="button"
              className={`bk-view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => handleSetViewMode("grid")}
              aria-label={locale === "km" ? "ទិដ្ឋភាពក្រឡា" : "Grid view"}
              title={locale === "km" ? "ទិដ្ឋភាពក្រឡា" : "Grid view"}
            >
              <Icon name="grid" size={17} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cards">
            {Array.from({ length: 8 }, (_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <BookingListSkeleton count={4} />
        )
      ) : failed ? (
        <Empty
          icon="xCircle"
          title={
            locale === "km"
              ? "មិនអាចផ្ទុកការកក់"
              : "Could not load your bookings"
          }
          actions={
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setReload((n) => n + 1)}
            >
              <Icon name="refresh" size={14} />
              {locale === "km" ? "ព្យាយាមម្តងទៀត" : "Retry"}
            </button>
          }
        >
          {locale === "km"
            ? "សូមព្យាយាមម្តងទៀត។"
            : "Your bookings are unavailable right now. Please try again."}
        </Empty>
      ) : filtered.length ? (
        <>
          <Group
            title={locale === "km" ? "ជិតមកដល់" : "Upcoming"}
            icon="calendar"
            list={upcoming}
            apiEvents={apiEvents}
            ticketCounts={ticketCounts}
            viewMode={viewMode}
          />
          <Group
            title={locale === "km" ? "កន្លងផុត" : "Past"}
            icon="clock"
            list={past}
            apiEvents={apiEvents}
            ticketCounts={ticketCounts}
            viewMode={viewMode}
          />
        </>
      ) : (
        <Empty
          icon="ticket"
          title={t("noBookings")}
          actions={
            <>
              {state && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setState("")}
                >
                  {t("allStatuses")}
                </button>
              )}
              <Link className="btn btn-sm btn-primary" to="/events">
                {t("browseEvents")}
              </Link>
            </>
          }
        />
      )}
    </div>
  );
}
