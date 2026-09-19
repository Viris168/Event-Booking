import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ActionMenu from "../../components/ActionMenu.jsx";
import AdminUserEditDialog from "../../components/admin/AdminUserEditDialog.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Icon from "../../components/Icon.jsx";
import {
  ActiveFilters,
  Alert,
  Badge,
  Empty,
  Field,
  IconSelect,
  Money,
  ResponsiveTable,
  SearchInput,
  TablePager,
} from "../../components/ui.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { TableRowsSkeleton } from "../../components/Skeleton.jsx";
import { useLocale } from "../../context/LocaleContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { usePaging } from "../../lib/usePaging.js";
import {
  anonymizeUser,
  deleteUser,
  getUsers,
  setUserDisabled,
  updateUser,
} from "../../api/admin.js";

const ROLES = ["CUSTOMER", "ORGANIZER", "PLATFORM_ADMIN"];

/*
 * Accounts, from the database.
 *
 * This screen used to read mock/store.js, which had two consequences worth
 * stating plainly: it listed people who did not exist, and its disable button
 * flipped a field in a browser tab while the real account carried on logging
 * in. Both halves now go through /admin/users.
 *
 * Filtering is server-side. The mock held every user in memory and filtered the
 * array, which is fine until the platform has more accounts than a tab wants to
 * keep - and the search has to reach rows this page has never loaded anyway.
 */
export default function AdminUsersPage() {
  const { t, locale, date } = useLocale();
  const km = locale === "km";
  useDocumentTitle(t("users"));
  const toast = useToast();

  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [disabled, setDisabled] = useState("");
  const [expanded, setExpanded] = useState(null);
  // Holds the user awaiting a disable confirmation. Disabling locks someone out
  // of an account they may be mid-booking on, so it asks first; re-enabling is
  // harmless and stays one click.
  const [confirming, setConfirming] = useState(null);
  /*
   * Which question the shared dialog is asking: 'disable', 'delete' or
   * 'anonymize'. One dialog rather than three, because they are never asked at
   * once and only the copy differs - but the copy is the whole job here, since
   * the three are not equally grave and two of them cannot be undone.
   */
  const [intent, setIntent] = useState("disable");

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState(null);

  /*
   * The account being edited, plus the save's own in-flight and error state.
   *
   * The error lives here rather than going through toast() because it belongs
   * to the dialog: a refusal like "that email is already registered" is about
   * the field still on screen, and a toast that fades while the form sits there
   * unchanged leaves the admin looking at a Save button that did nothing.
   */
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  /*
   * Typing re-queries, so the request is debounced. Without the delay every
   * keystroke in the search box is its own round trip, and the answers race:
   * "sok" can land after "sokh" and leave the wrong rows on screen.
   */
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      getUsers({
        // Omit rather than send empty - the API reads a missing parameter as
        // "no filter", and `disabled` in particular needs absent and false to
        // stay different questions: absent is both, false is active only.
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(role ? { role } : {}),
        ...(disabled ? { disabled: disabled === "yes" } : {}),
      })
        .then((res) => {
          if (!live) return;
          setLoadError(false);
          setUsers(Array.isArray(res) ? res : []);
        })
        .catch(() => {
          if (!live) return;
          setLoadError(true);
          setUsers([]);
        })
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, role, disabled, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  /*
   * Paging happens here rather than on /admin/users.
   *
   * The filters above are already the server's, which is what keeps the row
   * count sane; this only decides how much of the answer is on screen at once.
   * The reset key is those same three controls, so narrowing a search returns
   * to page 1 instead of stranding the reader past the end of a shorter result.
   */
  const paged = usePaging(users, `${q}|${role}|${disabled}`);

  /*
   * Who is signed in, so the dialog can grey out the role control on the
   * admin's own row. The server refuses that change regardless; this only stops
   * the click that was always going to be refused.
   */
  const { user: currentUser } = useAuth();

  async function saveUser(form) {
    setSaving(true);
    setSaveError(null);
    try {
      await updateUser(editing.id, {
        display_name: form.display_name.trim(),
        // Blank means "clear it", and the server normalises "" to null. Sent
        // rather than omitted: omitting a field in a PATCH means "leave it
        // alone", which is a different instruction from "empty it".
        email: form.email.trim(),
        phone_e164: form.phone_e164.trim(),
        role: form.role,
        ...(form.role === "ORGANIZER"
          ? {
              org_name_en: form.org_name_en.trim(),
              org_name_km: form.org_name_km.trim(),
            }
          : {}),
      });
      toast(km ? "បានរក្សាទុក" : "Account updated", "success");
      setEditing(null);
      refresh();
    } catch (e) {
      setSaveError(
        errorText(e, km ? "មិនអាចរក្សាទុកបានទេ" : "Could not save that change"),
      );
    } finally {
      setSaving(false);
    }
  }

  function ask(user, which) {
    setIntent(which);
    setConfirming(user);
  }

  /*
   * Erase the account.
   *
   * Only ever succeeds on an account that has never done anything. The menu
   * hides it once a booking exists, but a booking is not the only thing that
   * holds a row down - a gate scan, a review decision, an event they organise
   * all do too - so the server's refusal is what actually decides, and it
   * arrives naming every reason and pointing at anonymise. That is why the
   * error is not flattened into a generic failure message.
   */
  async function removeUser(user) {
    setBusyId(user.id);
    try {
      await deleteUser(user.id);
      toast(km ? "បានលុបគណនី" : "Account deleted", "info");
      refresh();
    } catch (e) {
      toast(
        errorText(
          e,
          km ? "មិនអាចលុបគណនីបានទេ" : "Could not delete this account",
        ),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  /** Clear the person out and leave the records. Irreversible. */
  async function anonymize(user) {
    setBusyId(user.id);
    try {
      await anonymizeUser(user.id);
      toast(
        km ? "បានលុបព័ត៌មានផ្ទាល់ខ្លួន" : "Personal details cleared",
        "info",
      );
      refresh();
    } catch (e) {
      toast(
        errorText(e, km ? "មិនបានសម្រេច" : "Could not anonymize this account"),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function applyDisabled(user, next) {
    setBusyId(user.id);
    try {
      await setUserDisabled(user.id, next);
      toast(
        `${user.display_name} ${next ? (km ? "បានបិទ" : "disabled") : km ? "បានបើក" : "enabled"}`,
        next ? "info" : "success",
      );
      refresh();
    } catch (e) {
      toast(
        errorText(e, km ? "មិនអាចរក្សាទុកបានទេ" : "Could not save that change"),
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  const stateLabel = (v) =>
    v === "yes" ? (km ? "បានបិទ" : "Disabled") : km ? "សកម្ម" : "Active";
  const chips = [
    q && { key: "q", icon: "search", label: q, onRemove: () => setQ("") },
    role && {
      key: "role",
      icon: "shield",
      label: role,
      onRemove: () => setRole(""),
    },
    disabled && {
      key: "disabled",
      icon: "user",
      label: stateLabel(disabled),
      onRemove: () => setDisabled(""),
    },
  ].filter(Boolean);

  function clearAll() {
    setQ("");
    setRole("");
    setDisabled("");
  }

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <div className="page-title-lockup">
            <span className="icon-chip green lg">
              <Icon name="users" size={22} />
            </span>
            <h1>{t("users")}</h1>
          </div>
          <p>
            {loading
              ? km
                ? "កំពុងផ្ទុក…"
                : "Loading…"
              : `${users.length} ${km ? "អ្នកប្រើប្រាស់ត្រូវនឹងតម្រង" : "users match the current filters"}`}
          </p>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" style={{ marginBottom: "1.2rem" }}>
          {km ? "មិនអាចផ្ទុកអ្នកប្រើប្រាស់បានទេ។" : "Could not load users."}{" "}
          <button className="btn btn-sm btn-outline" onClick={refresh}>
            {km ? "ព្យាយាមម្ដងទៀត" : "Try again"}
          </button>
        </Alert>
      )}

      <div className="panel" style={{ marginBottom: "1.2rem" }}>
        <div className="panel-body">
          <div className="filterbar">
            <Field label={t("searchLabel")}>
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder={
                  km ? "ឈ្មោះ លេខទូរស័ព្ទ អ៊ីមែល" : "Name, phone or email"
                }
                ariaLabel={t("searchLabel")}
                clearLabel={t("reset")}
              />
            </Field>
            <Field label={km ? "តួនាទី" : "Role"}>
              <IconSelect
                icon="shield"
                value={role}
                onChange={setRole}
                ariaLabel={km ? "តួនាទី" : "Role"}
              >
                <option value="">{km ? "គ្រប់តួនាទី" : "All roles"}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label={km ? "ស្ថានភាពគណនី" : "Account state"}>
              <IconSelect
                icon="user"
                value={disabled}
                onChange={setDisabled}
                ariaLabel={km ? "ស្ថានភាពគណនី" : "Account state"}
              >
                <option value="">{km ? "ទាំងអស់" : "All"}</option>
                <option value="no">{km ? "សកម្ម" : "Active"}</option>
                <option value="yes">{km ? "បានបិទ" : "Disabled"}</option>
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

      {!loading && users.length === 0 && !loadError ? (
        <Empty
          icon="search"
          title={km ? "រកមិនឃើញអ្នកប្រើទេ" : "No users match"}
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
                  <th>{km ? "អ្នកប្រើ" : "User"}</th>
                  <th>{km ? "តួនាទី" : "Role"}</th>
                  <th>{t("phone")}</th>
                  <th>{t("email")}</th>
                  <th>{km ? "ចុះឈ្មោះ" : "Joined"}</th>
                  <th>{t("status")}</th>
                  <th />
                </tr>
              </thead>
              {/*
              The table holds its height while it loads.

              An empty <tbody> collapses the page to nothing, which parks the
              footer halfway up the window; when the rows land the document
              suddenly grows by a screenful and the footer leaps out from under
              the reader. Ten placeholder rows are taller than a viewport, so
              the footer is below the fold before and after and nothing visibly
              moves. Same call the payouts table already makes.
            */}
              {loading ? (
                <TableRowsSkeleton
                  rows={10}
                  cols={7}
                  cellClassName="px-[0.9rem] py-[0.7rem]"
                  rowClassName="border-b border-line-2"
                />
              ) : (
                <tbody>
                  {paged.visible.map((u) => {
                    const bookings = u.bookings ?? [];
                    return (
                      <Fragment key={u.id}>
                        <tr className={u.disabled ? "flagged" : ""}>
                          <td>
                            <div className="font-bold">{u.display_name}</div>
                            <div className="small muted">#{u.id}</div>
                          </td>
                          <td>
                            <span className="badge badge-mode">{u.role}</span>
                          </td>
                          <td className="mono small">{u.phone_e164 || "—"}</td>
                          <td className="small">{u.email || "—"}</td>
                          <td className="small muted">{date(u.created_at)}</td>
                          <td>
                            {u.disabled ? (
                              <span className="badge s-CANCELLED">
                                {km ? "បានបិទ" : "Disabled"}
                              </span>
                            ) : (
                              <span className="badge s-CONFIRMED">
                                {km ? "សកម្ម" : "Active"}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="row row-tight">
                              {/* Stays a button, not a menu item: it toggles the
                              expander on this same row, so it is navigation
                              within the table rather than an action on the
                              account - and it carries the booking count, which
                              is information the row would otherwise not show. */}
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() =>
                                  setExpanded(expanded === u.id ? null : u.id)
                                }
                              >
                                {u.booking_count} {km ? "ការកក់" : "bookings"}
                              </button>

                              <ActionMenu
                                disabled={busyId === u.id}
                                label={km ? "សកម្មភាព" : "Actions"}
                                items={[
                                  {
                                    key: "edit",
                                    icon: "edit",
                                    label: t("edit"),
                                    onSelect: () => {
                                      setSaveError(null);
                                      setEditing(u);
                                    },
                                  },
                                  {
                                    // Re-enabling is harmless, so it skips the
                                    // confirmation that disabling gets.
                                    key: "enable",
                                    icon: "checkCircle",
                                    label: t("enable"),
                                    hidden: !u.disabled,
                                    onSelect: () => applyDisabled(u, false),
                                  },
                                  {
                                    // Locks someone out of an account they may be
                                    // mid-booking on, so it asks first.
                                    key: "disable",
                                    icon: "alert",
                                    label: t("disable"),
                                    tone: "danger",
                                    /*
                                     * Never offered on your own row. The server
                                     * refuses it outright - an admin disabling
                                     * themselves is the one click that locks
                                     * everybody out, with no way back except SQL -
                                     * so showing the button would only ever produce
                                     * an error message.
                                     *
                                     * The last-remaining-admin case is deliberately
                                     * NOT hidden here: this list is filtered and
                                     * paged, so the browser cannot reliably know
                                     * whether another enabled admin exists. The
                                     * server counts and refuses, and the refusal
                                     * says why.
                                     */
                                    hidden:
                                      u.disabled ||
                                      (currentUser && u.id === currentUser.id),
                                    onSelect: () => ask(u, "disable"),
                                  },
                                  {
                                    /*
                                     * Clears the name, phone, email and credentials
                                     * and locks the account, keeping the bookings.
                                     * The answer for a real customer who wants to
                                     * be removed from the platform - their details
                                     * are theirs, their purchase history is also
                                     * the organiser's sales figures.
                                     *
                                     * Not on your own row, for the same reason
                                     * disable is not: it ends the account's ability
                                     * to sign in, and the server refuses it.
                                     */
                                    key: "anonymize",
                                    icon: "eyeOff",
                                    label: km
                                      ? "លុបព័ត៌មានផ្ទាល់ខ្លួន"
                                      : "Anonymize",
                                    tone: "danger",
                                    hidden:
                                      currentUser && u.id === currentUser.id,
                                    onSelect: () => ask(u, "anonymize"),
                                  },
                                  {
                                    /*
                                     * Erasing the row outright, and only offered
                                     * where it stands a chance: an account with a
                                     * booking against it cannot be deleted at all,
                                     * so the item is hidden rather than shown to
                                     * fail. Other history - a gate scan, a review
                                     * decision - is not visible from this row, so
                                     * the server still gets the final word and its
                                     * refusal names what it found.
                                     *
                                     * In practice this reaches the spam signup and
                                     * the duplicate registration, which is what it
                                     * is for.
                                     */
                                    key: "delete",
                                    icon: "trash",
                                    label: t("removeForever"),
                                    tone: "danger",
                                    /*
                                     * `deletable` and not `booking_count === 0`.
                                     * The two disagree on exactly the row where it
                                     * matters: an organiser with five events and no
                                     * bookings of their own is undeletable, because
                                     * event.organizer_id points through their
                                     * profile at them, and the booking count says
                                     * nothing about it. The server computes this
                                     * from every column that references the
                                     * account.
                                     */
                                    hidden:
                                      !u.deletable ||
                                      (currentUser && u.id === currentUser.id),
                                    onSelect: () => ask(u, "delete"),
                                  },
                                ]}
                              />
                            </div>
                          </td>
                        </tr>
                        {expanded === u.id && (
                          <tr>
                            <td colSpan="7" className="bg-surface-2">
                              <div
                                className="spread"
                                style={{ marginBottom: "0.5rem" }}
                              >
                                <span className="tiny">
                                  {km ? "ប្រវត្តិការកក់" : "Booking history"}
                                </span>
                                <span className="small">
                                  {km ? "ចំណាយសរុប" : "Lifetime spend"}:{" "}
                                  <Money cents={u.lifetime_spend_usd_cents} />
                                </span>
                              </div>
                              {bookings.length ? (
                                <div className="stack-sm">
                                  {bookings.map((b) => (
                                    <div className="spread small" key={b.id}>
                                      <Link
                                        className="mono"
                                        to={`/bookings/${b.id}`}
                                      >
                                        {b.booking_ref}
                                      </Link>
                                      <Badge status={b.state} />
                                      <span className="muted">
                                        {date(b.created_at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="muted small">—</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              )}
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

      <AdminUserEditDialog
        open={Boolean(editing)}
        user={editing}
        isSelf={Boolean(
          editing && currentUser && editing.id === currentUser.id,
        )}
        busy={saving}
        error={saveError}
        onSave={saveUser}
        onClose={() => {
          setEditing(null);
          setSaveError(null);
        }}
      />

      {/*
       * One dialog, three questions, and the copy is what separates them.
       * Disabling is reversible and says so; the other two are not, and each
       * spells out exactly what survives - because the difference between them
       * is precisely which records are kept, and an admin choosing between
       * them needs that on screen rather than in a doc.
       */}
      <ConfirmDialog
        open={Boolean(confirming)}
        tone="danger"
        title={
          intent === "delete"
            ? km
              ? "លុបគណនីនេះជាអចិន្ត្រៃយ៍?"
              : "Delete this account permanently?"
            : intent === "anonymize"
              ? km
                ? "លុបព័ត៌មានផ្ទាល់ខ្លួនរបស់អ្នកប្រើនេះ?"
                : "Clear this person’s details?"
              : km
                ? "បិទគណនីនេះ?"
                : "Disable this account?"
        }
        confirmLabel={
          intent === "delete"
            ? t("removeForever")
            : intent === "anonymize"
              ? km
                ? "លុបព័ត៌មាន"
                : "Anonymize"
              : t("disable")
        }
        onConfirm={() => {
          if (intent === "delete") removeUser(confirming);
          else if (intent === "anonymize") anonymize(confirming);
          else applyDisabled(confirming, true);
          setConfirming(null);
        }}
        onClose={() => setConfirming(null)}
      >
        <p className="small muted">
          {intent === "delete"
            ? km
              ? `គណនីរបស់ ${confirming?.display_name} នឹងត្រូវលុបចេញទាំងស្រុង។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។ បើគណនីនេះធ្លាប់មានប្រតិបត្តិការណាមួយ ម៉ាស៊ីនមេនឹងបដិសេធ ហើយប្រាប់មូលហេតុ។`
              : `${confirming?.display_name}’s account row is removed entirely. This cannot be undone. If the account turns out to have any history behind it, the server will refuse and tell you what it found.`
            : intent === "anonymize"
              ? km
                ? `ឈ្មោះ លេខទូរស័ព្ទ អ៊ីមែល និងពាក្យសម្ងាត់របស់ ${confirming?.display_name} នឹងត្រូវលុប ហើយគណនីនឹងត្រូវបិទ។ ការកក់ សំបុត្រ និងការទូទាត់នៅដដែល ហើយសំបុត្រដែលបានលក់រួចនៅតែស្កេនបាន។ មិនអាចត្រឡប់វិញបានទេ។${
                    confirming?.role === "ORGANIZER"
                      ? " ឈ្មោះអង្គភាពនៅដដែល ព្រោះវាបង្ហាញលើព្រឹត្តិការណ៍ទាំងអស់។"
                      : ""
                  }`
                : `${confirming?.display_name}’s name, phone number, email and credentials are cleared and the account is locked. Their bookings, tickets and payments stay, and tickets already sold still scan at the gate. This cannot be undone.${
                    confirming?.role === "ORGANIZER"
                      ? " Their organisation name is left alone, because it is printed on every event they published — edit the organisation separately if that name also has to go."
                      : ""
                  }`
              : km
                ? `${confirming?.display_name} នឹងមិនអាចចូលគណនីបានទេ។ ការកក់ដែលមានស្រាប់មិនត្រូវបានលុបចោលទេ ហើយអ្នកអាចបើកវិញនៅពេលណាក៏បាន។`
                : `${confirming?.display_name} will not be able to log in. Existing bookings are left untouched, and you can re-enable the account at any time.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function errorText(e, fallback) {
  const detail = e?.response?.data?.detail || e?.response?.data?.message;
  return detail ? `${fallback}: ${detail}` : fallback;
}
