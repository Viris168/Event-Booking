import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ActionMenu from "../../components/ActionMenu.jsx";
import AdminEventEditDialog from "../../components/admin/AdminEventEditDialog.jsx";
import AdminForceDeleteDialog from "../../components/admin/AdminForceDeleteDialog.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Icon from "../../components/Icon.jsx";
import {
  ActiveFilters,
  Badge,
  Empty,
  Field,
  IconSelect,
  Progress,
  ResponsiveTable,
  SearchInput,
  TablePager,
} from "../../components/ui.jsx";
import { TableSkeleton } from "../../components/Skeleton.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { usd } from "../../lib/format.js";
import { Alert } from "../../components/ui.jsx";
import {
  deleteEvent,
  forceDeleteEvent,
  getEventForAdmin,
  getEventsOverview,
  restoreEvent,
  takeDownEvent,
  updateEventAsAdmin,
} from "../../api/admin.js";
import { usePaging } from "../../lib/usePaging.js";
import { useProvinces } from "../../lib/useProvinces.js";
import {
  SALES_UI,
  displayStatus,
  isPast,
  salesState,
} from "../../lib/salesState.js";

// Declaration order is lifecycle order, so the filter dropdown reads as the
// path an event actually takes rather than as an alphabetical list.
//
// No DRAFT. A draft is the organiser's private workspace and has been shown to
// nobody, so there is no moderation decision to take on it - the review queue
// leaves it out for that reason and this table now does too. The server no
// longer returns one either; the filter is the courtesy, the query is the rule.
//
// FINISHED is the odd entry: not a stored status, but what the badge says once
// the date has passed (see displayStatus). Leaving it off the list was what let
// this screen contradict itself - filtering on TAKEN_DOWN matched the stored
// column and returned rows whose badge read "Finished", with no way to ask for
// the finished ones directly.
const STATUSES = [
  "PENDING_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "TAKEN_DOWN",
  "FINISHED",
];

/*
 * The moderation table, from the database.
 *
 * Every number here used to come from mock/store.js, so the sold/capacity bars
 * and the revenue column described a fixture file rather than the platform -
 * and "take down" flipped a field in a tab while the event carried on selling.
 * Both halves now go through /admin/events.
 */
export default function AdminEventsPage() {
  const { t, locale, date } = useLocale();
  const km = locale === "km";
  useDocumentTitle(t("moderation"));
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [province, setProvince] = useState("");
  /*
   * The event awaiting a confirmation, and which one it is awaiting.
   *
   * One pair of state rather than two booleans, because the two destructive
   * actions are mutually exclusive and share a dialog: `confirming` is the row,
   * `intent` is 'takedown' or 'delete'. Opening again is neither - it puts an
   * event back on sale and is trivially undone by taking it down again, so it
   * stays one click.
   */
  const [confirming, setConfirming] = useState(null);
  const [intent, setIntent] = useState("takedown");

  /*
   * Force delete gets its own state and its own dialog rather than a third
   * `intent`. The other two are a yes/no question; this one asks for a
   * download, a typed title and a written reason, and folding a form into the
   * dialog that currently renders one paragraph would make the ordinary
   * take-down carry the machinery of the worst case.
   */
  const [forceDeleting, setForceDeleting] = useState(null);

  /*
   * The edit dialog. `editing` is the full event from the admin endpoint, not
   * the table row: the row carries only the columns the table prints, and the
   * form needs the descriptions and the three secondary timestamps too.
   * `editingId` is set first so the dialog can open on the loading state rather
   * than after the round trip.
   */
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // provinceName comes from the hook rather than being written again here: it
  // already falls back to the raw code for a province the list does not know,
  // which is what makes a data problem visible instead of blank.
  const { provinces, provinceName } = useProvinces();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState(null);

  // Debounced, because typing in the search box re-queries and the answers
  // would otherwise race - "jaz" can land after "jazz".
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      getEventsOverview({
        ...(q.trim() ? { q: q.trim() } : {}),
        // FINISHED is derived from the date, not stored, so there is nothing
        // to ask the server for - it sends back every status and `rows` below
        // keeps the ones that are over.
        ...(status !== "ALL" && status !== "FINISHED" ? { status } : {}),
        ...(province ? { province } : {}),
      })
        .then((res) => {
          if (!live) return;
          setLoadError(false);
          setEvents(Array.isArray(res) ? res : []);
        })
        .catch(() => {
          if (!live) return;
          setLoadError(true);
          setEvents([]);
        })
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, status, province, version]);

  /*
   * The filter answers to the badge, not to the database column.
   *
   * `status` goes to the server, which matches what is stored - but a row whose
   * date has passed reads FINISHED whatever that column says. Filtering on one
   * and labelling with the other is what put two "Finished" rows under a
   * TAKEN_DOWN filter: all four were genuinely taken down, and two of them had
   * since happened. Narrowing here makes the two agree - ask for a lifecycle
   * status and every row says it, ask for Finished and every row is over.
   */
  const rows = useMemo(
    () =>
      status === "ALL"
        ? events
        : events.filter((e) => displayStatus(e) === status),
    [events, status],
  );

  /*
   * Paging is client-side, and on `rows` rather than on `events`.
   *
   * It has to be: FINISHED is derived from each row's date rather than stored,
   * so the filter above runs in the browser and the server cannot know how many
   * rows the reader is actually looking at. Slicing the server's answer instead
   * would hand out pages of wildly different lengths under that one filter.
   */
  const paged = usePaging(rows, `${q}|${status}|${province}`);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Fetches the full event whenever the dialog is opened on a row. Keyed on the
  // id rather than the row object so re-rendering the table - which rebuilds
  // every row - does not refetch the event under an open form.
  //
  // Clearing `editing` is closeEditor's job, not this effect's: doing it here
  // would be a synchronous setState in an effect body, which costs an extra
  // render pass for something the one action that closes the dialog already
  // knows to do.
  useEffect(() => {
    if (!editingId) return undefined;
    let live = true;
    getEventForAdmin(editingId)
      .then((e) => live && setEditing(e))
      .catch((e) => {
        if (!live) return;
        setSaveError(
          errorText(e, km ? "មិនអាចផ្ទុកបានទេ" : "Could not load this event"),
        );
      });
    return () => {
      live = false;
    };
  }, [editingId, km]);

  async function takeDown(event) {
    setBusyId(event.id);
    try {
      await takeDownEvent(event.id);
      toast(km ? "បានដកចេញ" : "Event taken down", "info");
      refresh();
    } catch (e) {
      toast(
        errorText(e, km ? "មិនបានសម្រេច" : "Could not take this event down"),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openAgain(event) {
    setBusyId(event.id);
    try {
      await restoreEvent(event.id);
      toast(km ? "បានបើកលក់ឡើងវិញ" : "Event is back on sale", "success");
      refresh();
    } catch (e) {
      toast(
        errorText(e, km ? "មិនបានសម្រេច" : "Could not open this event again"),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  /*
   * The one action on this screen that cannot be undone.
   *
   * The server refuses it for any event that has ever been booked - the table
   * hides the button in that case, but the row's `deletable` flag comes from an
   * aggregate that may be seconds old, so the refusal is what actually decides.
   * It arrives as a toast naming the reason, which is why the error is not
   * swallowed into a generic failure message.
   */
  async function removeForever(event) {
    setBusyId(event.id);
    try {
      await deleteEvent(event.id);
      toast(km ? "បានលុបចោល" : "Event removed", "info");
      refresh();
    } catch (e) {
      toast(
        errorText(e, km ? "មិនអាចលុបបានទេ" : "Could not remove this event"),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  /*
   * The only action in the product that voids tickets somebody paid for.
   *
   * Offered where `removeForever` is refused - an event with bookings - and
   * reached only through AdminForceDeleteDialog, which will not let it fire
   * until the sales record has been downloaded. The reason it passes up is
   * required by the server and written to the log beside that record.
   *
   * The one refusal left is an event already paid out to its organiser, and it
   * arrives as a toast naming the invoice, which is why the error is not
   * flattened into a generic failure.
   */
  async function forceRemove(event, reason) {
    setBusyId(event.id);
    try {
      await forceDeleteEvent(event.id, reason);
      toast(
        km ? "បានលុបព្រឹត្តិការណ៍ និងការកក់" : "Event and its bookings erased",
        "info",
      );
      setForceDeleting(null);
      refresh();
    } catch (e) {
      // The dialog stays open. The admin typed a title and a reason to get
      // here, and closing it on a refusal they may be able to act on would
      // make them do all of it again.
      toast(
        errorText(e, km ? "មិនអាចលុបបានទេ" : "Could not erase this event"),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveEvent(payload) {
    setSaving(true);
    setSaveError(null);
    try {
      await updateEventAsAdmin(editingId, payload);
      toast(km ? "បានរក្សាទុក" : "Event updated", "success");
      closeEditor();
      refresh();
    } catch (e) {
      setSaveError(
        errorText(e, km ? "មិនអាចរក្សាទុកបានទេ" : "Could not save that change"),
      );
    } finally {
      setSaving(false);
    }
  }

  function confirm(event, which) {
    setIntent(which);
    setConfirming(event);
  }

  /** The one way out of the edit dialog, so all three pieces of its state go together. */
  function closeEditor() {
    setEditingId(null);
    setEditing(null);
    setSaveError(null);
  }

  const chips = [
    q && { key: "q", icon: "search", label: q, onRemove: () => setQ("") },
    status !== "ALL" && {
      key: "status",
      icon: "filter",
      label: t(status),
      onRemove: () => setStatus("ALL"),
    },
    province && {
      key: "province",
      icon: "mapPin",
      label: provinceName(province, locale),
      onRemove: () => setProvince(""),
    },
  ].filter(Boolean);

  function clearAll() {
    setQ("");
    setStatus("ALL");
    setProvince("");
  }

  // The server sends the organisation and its owner separately so the column
  // can be localised here rather than in SQL.
  function organizerName(e) {
    const org = km ? e.organizer_name_km : e.organizer_name_en;
    if (!org) return "—";
    return e.organizer_owner_name ? `${org} · ${e.organizer_owner_name}` : org;
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <div className="page-title-lockup">
            <span className="icon-chip green lg">
              <Icon name="calendar" size={22} />
            </span>
            <h1>{t("moderation")}</h1>
          </div>
          <p>
            {loading
              ? km
                ? "កំពុងផ្ទុក…"
                : "Loading…"
              : `${rows.length} ${
                  km
                    ? "ព្រឹត្តិការណ៍ត្រូវនឹងតម្រង — គ្រប់ម្ចាស់ទាំងអស់។"
                    : "events match the current filters, across every owner."
                }`}
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.2rem" }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={t("searchLabel")}>
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder={km ? "ចំណងជើង ឬទីកន្លែង" : "Title or venue"}
                ariaLabel={t("searchLabel")}
                clearLabel={t("reset")}
              />
            </Field>
            <Field label={t("status")}>
              <IconSelect
                icon="filter"
                value={status}
                onChange={setStatus}
                ariaLabel={t("status")}
              >
                <option value="ALL">{km ? "ទាំងអស់" : "All statuses"}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={t("province")}>
              <IconSelect
                icon="mapPin"
                value={province}
                onChange={setProvince}
                ariaLabel={t("province")}
              >
                <option value="">{t("allProvinces")}</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {km ? p.name_km : p.name_en}
                  </option>
                ))}
              </IconSelect>
            </Field>
          </div>

          {chips.length > 0 && (
            <div style={{ marginTop: "0.85rem" }}>
              <ActiveFilters
                items={chips}
                onClearAll={clearAll}
                clearAllLabel={t("reset")}
              />
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" style={{ marginBottom: "1.2rem" }}>
          {km ? "មិនអាចផ្ទុកព្រឹត្តិការណ៍បានទេ។" : "Could not load events."}{" "}
          <button className="btn btn-sm btn-outline" onClick={refresh}>
            {km ? "ព្យាយាមម្ដងទៀត" : "Try again"}
          </button>
        </Alert>
      )}

      {loading ? (
        /* A skeleton of the table rather than the words "Loading…": the one
           line collapsed the page to nothing and the footer rode up the window,
           then jumped a screenful when the rows landed. */
        <TableSkeleton rows={10} cols={7} />
      ) : rows.length === 0 && !loadError ? (
        <Empty
          icon="search"
          title={km ? "រកមិនឃើញព្រឹត្តិការណ៍ទេ" : "No events match"}
        >
          {km
            ? "សាកល្បងលុបតម្រងចេញ ឬស្វែងរកពាក្យផ្សេង។"
            : "Try clearing a filter or searching for something else."}
          {chips.length > 0 && (
            <button
              className="btn btn-sm btn-outline"
              onClick={clearAll}
              style={{ marginTop: "0.7rem" }}
            >
              {t("reset")}
            </button>
          )}
        </Empty>
      ) : (
        <div className="panel">
          <ResponsiveTable>
            <table className="table">
              <thead>
                <tr>
                  <th>{km ? "ព្រឹត្តិការណ៍" : "Event"}</th>
                  <th>{t("organizer")}</th>
                  <th>{t("status")}</th>
                  <th>{locale === "km" ? "កាលបរិច្ឆេទ" : "Date"}</th>
                  <th style={{ minWidth: 150 }}>{t("ticketsSold")}</th>
                  <th className="num">{t("revenue")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {/* The tint follows the badge, not the stored status. A finished
                  event reads "Finished" whatever it was taken down from, so
                  colouring it as taken down contradicted its own label. */}
                {paged.visible.map((e) => (
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
                    <td className="small">{organizerName(e)}</td>
                    <td>
                      <Badge status={displayStatus(e)} />
                      {/* The same pill the organiser sees. "Published" is what
                        the organiser decided; this is what is happening - and
                        without it the moderation table cannot tell a live event
                        from one that finished last month. */}
                      {(() => {
                        const state = salesState(e);
                        // Every finished row's badge now reads "Finished", so a
                        // pill saying it again is pure repetition.
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
                      <div className="small muted">
                        {e.sold} / {e.capacity}
                      </div>
                      <Progress
                        sold={e.sold}
                        held={e.held}
                        capacity={e.capacity}
                      />
                    </td>
                    <td className="num font-bold">
                      {usd(e.revenue_usd_cents)}
                    </td>
                    <td>
                      {/*
                       * One kebab rather than up to four buttons. The actions a
                       * row offers depend entirely on its status, so laid out
                       * flat the column's width was set by whichever event
                       * happened to offer the most - and the two destructive
                       * ones sat in the open, a mis-click away from a live
                       * listing.
                       *
                       * Every action is written out here and each says when it
                       * does not apply, which keeps the rules in one readable
                       * list instead of scattered across nested ternaries.
                       */}
                      <ActionMenu
                        disabled={busyId === e.id}
                        label={km ? "សកម្មភាព" : "Actions"}
                        items={[
                          {
                            // Not once the event has happened. The show is over,
                            // so every field here would now describe something
                            // other than what took place - and the server refuses
                            // the PATCH for the same reason.
                            key: "edit",
                            icon: "edit",
                            label: t("edit"),
                            hidden: isPast(e),
                            onSelect: () => {
                              setSaveError(null);
                              setEditingId(e.id);
                            },
                          },
                          {
                            // Legal only from PUBLISHED - the one status where
                            // there is something on sale to stop.
                            key: "takedown",
                            icon: "alert",
                            label: t("takeDown"),
                            tone: "danger",
                            // Not on a finished event: it left the catalogue when
                            // its date passed, so there is nothing to stop. The
                            // server refuses it too.
                            hidden: e.status !== "PUBLISHED" || isPast(e),
                            onSelect: () => confirm(e, "takedown"),
                          },
                          {
                            /*
                             * The undo for take-down, and the reason TAKEN_DOWN
                             * stopped being a terminal state.
                             *
                             * Not offered once the event has happened: the server
                             * refuses it, because putting a finished show back to
                             * PUBLISHED changes nothing except a badge that would
                             * then be wrong - it still cannot sell, and the
                             * catalogue lists from today onward.
                             */
                            key: "restore",
                            icon: "checkCircle",
                            label: t("openAgain"),
                            hidden: e.status !== "TAKEN_DOWN" || isPast(e),
                            onSelect: () => openAgain(e),
                          },
                          {
                            /*
                             * The only irreversible action here, and offered only
                             * where the server would accept it: `deletable` is
                             * false for any event that has ever been booked.
                             * Shown disabled rather than hidden in that case, with
                             * the reason as its label - a button that silently
                             * vanishes reads as a missing feature, not a refusal.
                             */
                            key: "delete",
                            icon: "close",
                            label: t("removeForever"),
                            // The reason rides alongside as a hint rather than in
                            // the label, so the item stays one short line whether
                            // or not it is available.
                            // The larger of the two counts the server checks. An
                            // event can carry sold inventory with no booking row
                            // behind it, and "0 booked" beside a disabled button
                            // reads as a bug rather than as the reason.
                            hint: e.deletable
                              ? undefined
                              : km
                                ? `កក់ ${Math.max(e.booking_count ?? 0, e.sold ?? 0)}`
                                : `${Math.max(e.booking_count ?? 0, e.sold ?? 0)} booked`,
                            tone: "danger",
                            disabled: !e.deletable,
                            /*
                             * Take-down is the right action for a live listing,
                             * so removal is not offered alongside it - but only
                             * while the listing is actually live. A finished
                             * PUBLISHED event can no longer be taken down, so
                             * hiding remove there too left it with no action at
                             * all and no way to clear a bookingless test event.
                             */
                            hidden: e.status === "PUBLISHED" && !isPast(e),
                            onSelect: () => confirm(e, "delete"),
                          },
                          {
                            /*
                             * The last resort, and shown only where the ordinary
                             * remove is refused: `deletable` false means the
                             * event has sold something, which is exactly the case
                             * this exists for and the case that one will not
                             * touch. Offering both at once would present them as
                             * a choice, and they are not - one is for a listing
                             * nobody bought, this is for a listing that should
                             * never have been on the platform.
                             *
                             * Unlike remove, it stays available on a live
                             * PUBLISHED event. An illegal listing selling tickets
                             * right now is the most urgent version of this, not
                             * the one to hide the action on.
                             */
                            key: "force-delete",
                            icon: "trash",
                            label: km ? "លុបទាំងការកក់" : "Erase with bookings",
                            hint: km
                              ? `កក់ ${Math.max(e.booking_count ?? 0, e.sold ?? 0)} — មិនអាចត្រឡប់វិញ`
                              : `${Math.max(e.booking_count ?? 0, e.sold ?? 0)} booked, no undo`,
                            tone: "danger",
                            hidden: e.deletable,
                            onSelect: () => setForceDeleting(e),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          <TablePager
            page={paged.page}
            pages={paged.pageCount}
            pageSize={paged.pageSize}
            onPage={paged.setPage}
            onPageSize={paged.setPageSize}
          />
        </div>
      )}

      <AdminForceDeleteDialog
        open={Boolean(forceDeleting)}
        event={forceDeleting}
        busy={busyId === forceDeleting?.id}
        onConfirm={(reason) => forceRemove(forceDeleting, reason)}
        onClose={() => setForceDeleting(null)}
      />

      <AdminEventEditDialog
        open={Boolean(editingId)}
        event={editing}
        busy={saving}
        error={saveError}
        onSave={saveEvent}
        onClose={closeEditor}
      />

      {/*
       * One dialog, two questions. They are never asked at once - an event is
       * either PUBLISHED (take-down) or not (remove) - and the copy is what
       * differs, because the two decisions are not equally grave: one is the
       * reversible action and the other is the only irreversible thing on this
       * screen. Saying so in the body is the whole job of this dialog.
       */}
      <ConfirmDialog
        open={Boolean(confirming)}
        tone="danger"
        title={
          intent === "delete"
            ? km
              ? "លុបព្រឹត្តិការណ៍នេះជាអចិន្ត្រៃយ៍?"
              : "Remove this event permanently?"
            : km
              ? "ដកព្រឹត្តិការណ៍នេះចេញ?"
              : "Take this event down?"
        }
        confirmLabel={intent === "delete" ? t("removeForever") : t("takeDown")}
        onConfirm={() => {
          if (intent === "delete") removeForever(confirming);
          else takeDown(confirming);
          setConfirming(null);
        }}
        onClose={() => setConfirming(null)}
      >
        <p className="small muted">
          {intent === "delete"
            ? km
              ? `«${confirming?.title_km}» និងតំបន់ ផែនទីកៅអី និងប្រវត្តិត្រួតពិនិត្យរបស់វា នឹងត្រូវលុបចោល។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`
              : `“${confirming?.title_en}” and its zones, seat map and review history are deleted for good. This cannot be undone — if you only want it off sale, take it down instead.`
            : km
              ? `«${confirming?.title_km}» នឹងបាត់ពីការស្វែងរក ហើយឈប់លក់សំបុត្រភ្លាម។ សំបុត្រដែលបានលក់រួចនៅតែមានសុពលភាព ហើយអ្នកអាចបើកលក់ឡើងវិញបាន។`
              : `“${confirming?.title_en}” disappears from search and stops selling immediately. Tickets already sold stay valid, and you can open it again afterwards.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function errorText(e, fallback) {
  const detail = e?.response?.data?.detail || e?.response?.data?.message;
  return detail ? `${fallback}: ${detail}` : fallback;
}
