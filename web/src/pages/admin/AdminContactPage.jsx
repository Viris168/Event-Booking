import { useCallback, useEffect, useState } from "react";
import FormDialog from "../../components/FormDialog.jsx";
import Icon from "../../components/Icon.jsx";
import {
  Alert,
  Empty,
  ResponsiveTable,
  TablePager,
} from "../../components/ui.jsx";
import { Skeleton, TableRowsSkeleton } from "../../components/Skeleton.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { telegramUrl } from "../../lib/contactLinks.js";
import { formatDateTime, timeAgo } from "../../lib/format.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { getContactInbox, handleContactMessage } from "../../api/contact.js";

/*
 * The support inbox - what the public contact form filed.
 *
 * Simpler than the review and application queues next to it, and deliberately
 * so. Those screens exist to reach a DECISION: approve or reject, with side
 * effects on either branch, which is why they are built as a split view that
 * walks an admin through one submission at a time. Nothing here is decided.
 * The actual work - writing the reply - happens in an email client, outside
 * this application entirely, and all this screen can do is say who is dealing
 * with what so two admins do not answer the same person twice.
 *
 * So: a list to scan, a dialog to read the whole message in, and four statuses.
 * Anything more would be a workflow nobody performs.
 */

// Declaration order is the order a message moves through them, so the tabs read
// as a path rather than an alphabet. ALL is last because it is the escape
// hatch, not a stage.
const TABS = ["NEW", "OPEN", "CLOSED", "SPAM", "ALL"];

const TAB_LABEL = {
  NEW: { en: "New", km: "ថ្មី" },
  OPEN: { en: "In progress", km: "កំពុងដោះស្រាយ" },
  CLOSED: { en: "Closed", km: "បានបញ្ចប់" },
  SPAM: { en: "Spam", km: "សារឥតបានការ" },
  ALL: { en: "All", km: "ទាំងអស់" },
};

const TOPIC_LABEL = {
  BOOKING: { en: "Booking", km: "ការកក់" },
  PAYMENT: { en: "Payment", km: "ការទូទាត់" },
  ORGANIZER: { en: "Organiser", km: "អ្នករៀបចំ" },
  TECHNICAL: { en: "Technical", km: "បច្ចេកទេស" },
  OTHER: { en: "Other", km: "ផ្សេងទៀត" },
};

/** The statuses an admin may move a message TO. NEW is not one - the server
 *  refuses it, because NEW means nobody has looked and this is somebody
 *  looking. OPEN is how a message goes back in the queue. */
const MOVES = ["OPEN", "CLOSED", "SPAM"];

export default function AdminContactPage() {
  const { locale } = useLocale();
  const km = locale === "km";
  useDocumentTitle(km ? "សារ" : "Messages");
  const toast = useToast();

  const [tab, setTab] = useState("NEW");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);

  const [selected, setSelected] = useState(null);
  const [move, setMove] = useState("OPEN");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /*
   * The effect only writes results; setLoading(true) happens at each entry
   * point instead. A synchronous setState in an effect body during commit is
   * what React flags as a cascading render - the same note the applications
   * queue carries, and the same fix.
   */
  useEffect(() => {
    let active = true;
    getContactInbox({ status: tab === "ALL" ? null : tab, page, size })
      .then((res) => {
        if (!active) return;
        setData(res);
        setLoadError(false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, page, size, version]);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  const openTab = (next) => {
    setLoading(true);
    setTab(next);
    // Page 3 of NEW is not page 3 of CLOSED, and landing on an empty page that
    // exists in neither is how a tab switch looks broken.
    setPage(0);
  };

  const openMessage = (message) => {
    setSelected(message);
    // Pre-set to the next sensible move rather than to what it already is:
    // opening a NEW message is almost always the prelude to working on it, and
    // a CLOSED one is being reopened or it would not have been opened.
    setMove(message.status === "NEW" ? "OPEN" : "CLOSED");
    setNote(message.admin_note ?? "");
  };

  const save = async () => {
    if (busy || !selected) return;
    setBusy(true);
    try {
      await handleContactMessage(selected.id, {
        status: move,
        admin_note: note,
      });
      toast(km ? "បានរក្សាទុក" : "Saved", "success");
      setSelected(null);
      reload();
    } catch {
      toast(km ? "មិនអាចរក្សាទុកបានទេ" : "Could not save that", "error");
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts_by_status ?? {};
  const allCount = Object.values(counts).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );
  const rows = data?.items ?? [];
  const pages = data?.total_pages ?? 0;

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <div className="page-title-lockup">
            <span className="icon-chip green lg">
              <Icon name="mail" size={22} />
            </span>
            <h1>{km ? "សារពីទំព័រទំនាក់ទំនង" : "Support messages"}</h1>
          </div>
          <p>
            {km
              ? "សារដែលផ្ញើមកតាមទំព័រទំនាក់ទំនងជាសាធារណៈ។ ការឆ្លើយតបធ្វើឡើងតាមអ៊ីមែល។"
              : "Sent through the public contact form. Replies go out by email; this screen is how you and the other admins avoid answering the same person twice."}
          </p>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-hero shadow-card overflow-hidden">
        {/* Tabs inside card header, matching AdminPayoutsPage */}
        <div
          className="tabbar"
          role="tablist"
          aria-label={km ? "ស្ថានភាព" : "Status"}
        >
          {TABS.map((key) => {
            const count =
              key === "ALL" ? (counts[key] ?? allCount) : (counts[key] ?? 0);
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-pressed={tab === key}
                aria-selected={tab === key}
                onClick={() => openTab(key)}
              >
                {km ? TAB_LABEL[key].km : TAB_LABEL[key].en}
                <span className="tab-n">{count}</span>
              </button>
            );
          })}
        </div>

        {loadError && (
          <div className="p-4">
            <Alert
              tone="danger"
              title={km ? "មិនអាចទាញយកសារបានទេ" : "Could not load the inbox"}
              actions={
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={reload}
                >
                  {km ? "ព្យាយាមម្តងទៀត" : "Try again"}
                </button>
              }
            >
              {km ? "សូមព្យាយាមម្តងទៀត។" : "The request did not come back."}
            </Alert>
          </div>
        )}

        {!loading && !loadError && rows.length > 0 && (
          <p className="px-5 pt-3 text-small text-muted m-0">
            {rows.length}{" "}
            {km ? "សារ" : rows.length === 1 ? "message" : "messages"}
          </p>
        )}

        {!loadError && (
          <>
            <ResponsiveTable>
              {/* aria-busy while the rows load: TableRowsSkeleton renders its
                  <tbody> aria-hidden, so without this the table says nothing at
                  all to a screen reader between request and response - the rows
                  are hidden and no busy state replaces them. The organizer
                  tables get this from SkeletonRegion; these three never did. */}
              <table className="table" aria-busy={loading}>
                <thead>
                  <tr>
                    <th>{km ? "ទទួលបាន" : "Received"}</th>
                    <th>{km ? "អ្នកផ្ញើ" : "From"}</th>
                    <th>{km ? "ប្រធានបទ" : "Topic"}</th>
                    <th>{km ? "ចំណងជើង" : "Subject"}</th>
                    <th>{km ? "ស្ថានភាព" : "Status"}</th>
                    <th className="num">{km ? "សកម្មភាព" : "Action"}</th>
                  </tr>
                </thead>
                {loading ? (
                  <TableRowsSkeleton
                    rows={5}
                    cols={6}
                    cellClassName="px-[0.9rem] py-[0.7rem]"
                    rowClassName="border-b border-line-2"
                  />
                ) : rows.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={6}>
                        <Empty
                          icon="mail"
                          title={km ? "គ្មានសារទេ" : "Nothing here"}
                        >
                          {tab === "NEW"
                            ? km
                              ? "គ្មានសារថ្មីរង់ចាំទេ។"
                              : "No new messages waiting."
                            : km
                              ? "គ្មានសារក្នុងស្ថានភាពនេះទេ។"
                              : "No messages in this status."}
                        </Empty>
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span title={formatDateTime(m.received_at, locale)}>
                            {timeAgo(m.received_at, locale)}
                          </span>
                        </td>
                        <td>
                          <div className="stack-sm">
                            <b>{m.sender_name}</b>
                            <a className="small" href={`mailto:${m.reply_to}`}>
                              {m.reply_to}
                            </a>
                            {m.user_id && (
                              <span className="tiny">
                                {km ? "គណនី" : "Account"}: {m.account_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge">
                            {km
                              ? TOPIC_LABEL[m.topic]?.km
                              : TOPIC_LABEL[m.topic]?.en}
                          </span>
                        </td>
                        <td className="min-w-0">
                          <span className="line-clamp-2">{m.subject}</span>
                          {m.booking_ref && (
                            <span className="mono tiny"> {m.booking_ref}</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge s-${m.status}`}>
                            {km
                              ? TAB_LABEL[m.status]?.km
                              : TAB_LABEL[m.status]?.en}
                          </span>
                          {m.handled_by_name && (
                            <span className="tiny block">
                              {m.handled_by_name}
                            </span>
                          )}
                        </td>
                        <td className="num">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => openMessage(m)}
                          >
                            {km ? "អាន" : "Read"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </ResponsiveTable>

            {pages > 1 && (
              <TablePager
                page={page}
                pages={pages}
                pageSize={size}
                onPage={(p) => {
                  setLoading(true);
                  setPage(p);
                }}
                onPageSize={(n) => {
                  setLoading(true);
                  setSize(n);
                  setPage(0);
                }}
              />
            )}
          </>
        )}
      </div>

      {/* The message in full, and the only two things an admin can change about
          it. What the sender wrote is never editable - it is the record of what
          was said, and a screen that could rewrite it would be useless as one. */}
      <FormDialog
        open={!!selected}
        title={selected?.subject}
        subtitle={
          selected
            ? `${selected.sender_name} · ${formatDateTime(selected.received_at, locale)}`
            : ""
        }
        submitLabel={km ? "រក្សាទុក" : "Save"}
        busy={busy}
        onSubmit={save}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="stack">
            <div className="contact-admin-meta">
              <a
                className="btn btn-sm btn-outline"
                href={`mailto:${selected.reply_to}`}
              >
                <Icon name="mail" size={15} />
                {km ? "ឆ្លើយតប" : "Reply"}
              </a>
              {/* Rebuilt through the shared helper rather than concatenated
                  here: the value came from a public form, and contactLinks.js
                  is where "is this safe to put in an href" is answered once. */}
              {telegramUrl(selected.telegram_username) && (
                <a
                  className="btn btn-sm contact-btn-telegram"
                  href={telegramUrl(selected.telegram_username)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Icon name="telegram" size={15} />@
                  {selected.telegram_username}
                </a>
              )}
            </div>

            {selected.booking_ref && (
              <p className="small muted">
                {km ? "លេខយោងការកក់" : "Booking reference"}:{" "}
                <span className="mono">{selected.booking_ref}</span>
                {/* Said out loud, because it will happen: the sender typed
                    this and nothing checked it against a real booking. */}
                <span className="block tiny">
                  {km
                    ? "ជាអ្វីដែលអ្នកផ្ញើបានវាយបញ្ចូល — មិនទាន់បានផ្ទៀងផ្ទាត់ទេ។"
                    : "As typed by the sender. Not checked against a real booking."}
                </span>
              </p>
            )}

            <blockquote className="contact-admin-body">
              {selected.body}
            </blockquote>

            <div className="field">
              <label className="label" htmlFor="move">
                {km ? "ស្ថានភាព" : "Status"}
              </label>
              <select
                id="move"
                className="select"
                value={move}
                onChange={(e) => setMove(e.target.value)}
              >
                {MOVES.map((s) => (
                  <option key={s} value={s}>
                    {km ? TAB_LABEL[s].km : TAB_LABEL[s].en}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="note">
                {km ? "កំណត់ចំណាំផ្ទៃក្នុង" : "Internal note"}
                <span className="opt">
                  {" "}
                  {km ? "(ស្រេចចិត្ត)" : "(optional)"}
                </span>
              </label>
              <textarea
                id="note"
                className="textarea"
                rows={3}
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  km
                    ? "ឧ. ស្ទួននឹង #412"
                    : "e.g. duplicate of #412, phoned instead"
                }
              />
              <span className="hint">
                {km
                  ? "អ្នកផ្ញើមិនឃើញកំណត់ចំណាំនេះទេ។"
                  : "The sender never sees this."}
              </span>
            </div>
          </div>
        )}
      </FormDialog>
    </div>
  );
}
