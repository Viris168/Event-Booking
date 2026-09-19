import client from './client.js'

/**
 * Platform-admin calls. Separate from events.js because the audience is
 * different: everything here is refused unless the caller resolves to a
 * PLATFORM_ADMIN, and all of it hangs off /admin rather than /event.
 *
 * Keeping them apart also means the moderation screens import a module that
 * cannot accidentally offer an organiser action, and vice versa.
 */

/**
 * The review queue: events in one status, oldest submission first.
 *
 * Deliberately NOT getEvents({ status }). That endpoint is the public
 * catalogue and returns only PUBLISHED and TAKEN_DOWN - a draft must never be
 * listable by an anonymous caller. This one is admin-only on the server.
 *
 * @param {{ status?: string, page?: number, size?: number }} params
 *        status defaults to PENDING_REVIEW server-side.
 */
export const getReviewQueue = (params) =>
  client.get('/admin/events', { params }).then((r) => r.data)

/**
 * How many events sit in each status, as { PENDING_REVIEW: 2, ... }.
 *
 * Every status is present, zeros included - the review queue renders a tab per
 * status and one that vanished when its queue emptied would shift the others
 * under the reviewer's cursor mid-click.
 *
 * Deliberately not a field on getPlatformStats(): that payload runs a dozen
 * counts across users, bookings, payments and tickets, and this is polled while
 * the queue is open. Redrawing four numbers should not cost all of that.
 */
export const getEventStatusCounts = () =>
  client.get('/admin/events/status-counts').then((r) => r.data)

// --- decisions --------------------------------------------------------------
// One function per transition, mirroring events.js. approve and takedown carry
// no body; reject and request-changes require a message, because the organiser
// has to be told what to fix - the server rejects a blank one.

export const approveEvent = (id) =>
  client.patch(`/admin/events/${id}/approve`).then((r) => r.data)

export const rejectEvent = (id, message) =>
  client.patch(`/admin/events/${id}/reject`, { message }).then((r) => r.data)

export const requestEventChanges = (id, message) =>
  client.patch(`/admin/events/${id}/request-changes`, { message }).then((r) => r.data)

export const takeDownEvent = (id) =>
  client.patch(`/admin/events/${id}/takedown`).then((r) => r.data)

/**
 * Put a taken-down event back on sale. The undo for takeDownEvent.
 *
 * Take-down used to be the end of the road - TAKEN_DOWN had no outgoing edges,
 * and this module's own comment on the moderation table said so. It has one
 * now, because the only remedy for a listing pulled by mistake was asking the
 * organiser to rebuild the whole event under a new id that every ticket and
 * link points away from.
 *
 * Nothing is re-created: the seat map, pricing and bookings were never touched,
 * so this is one status going back the way it came.
 */
export const restoreEvent = (id) =>
  client.patch(`/admin/events/${id}/restore`).then((r) => r.data)

/**
 * Erase an event for good. No body comes back - there is nothing left.
 *
 * Not a stronger take-down, a different action. The server refuses this for any
 * event that has ever been booked, because the rows it would take with it are
 * somebody's tickets; take-down is what that case wants. What this is for is the
 * listing that should not exist at all - spam, a duplicate, a test event - where
 * leaving a TAKEN_DOWN row in the table forever is just clutter.
 */
export const deleteEvent = (id) => client.delete(`/admin/events/${id}`).then(() => undefined)

/**
 * Download this event's sales as a CSV file.
 *
 * Returns a Blob rather than parsed data, because nothing on the screen reads
 * it - the file is for the admin, and what they do with it happens in a
 * spreadsheet. saveBlob below is what turns it into a download.
 *
 * Its whole reason for existing is forceDeleteEvent. There is no refund path
 * anywhere in this product, so once an event's bookings are erased the list of
 * people owed their money back exists only in whatever was exported first.
 */
export const exportEventSales = (id) =>
  client.get(`/admin/events/${id}/export`, { responseType: 'blob' }).then((r) => ({
    blob: r.data,
    // The server names the file - it puts the event id in it, which matters
    // more than the title six weeks later when somebody goes looking for it.
    filename:
      /filename="(.+?)"/.exec(r.headers['content-disposition'] || '')?.[1] ||
      `event-${id}-sales.csv`,
  }))

/**
 * Hand the browser a file to save.
 *
 * The object URL is revoked on the next tick rather than immediately: Safari
 * reads it asynchronously after the click, and revoking in the same frame
 * cancels the download it was about to start.
 */
export const saveBlob = ({ blob, filename }) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Erase an event AND the bookings on it. No body comes back.
 *
 * The most destructive call in this module, and the only one that voids tickets
 * people paid for. Not an escalation of deleteEvent so much as a different
 * decision: that one is for listings nobody bought, this is for listings that
 * are illegal and have to leave the platform completely.
 *
 * The server refuses exactly one thing - an event whose payout has already been
 * PAID - because that transfer is recorded against the event and deleting it
 * would leave the money unaccounted for.
 *
 * POST, not DELETE, because the reason is required and travels in the body;
 * DELETE with a body is poorly specified and some proxies drop it.
 *
 * @param {string} reason why this listing had to go. At least 20 characters -
 *        the server enforces it. Nothing reads the field; it is written to the
 *        log beside the sales record, because "an admin deleted it" is not an
 *        adequate answer to someone asking what happened to their ticket.
 */
export const forceDeleteEvent = (id, reason) =>
  client.post(`/admin/events/${id}/force-delete`, { reason }).then(() => undefined)

/**
 * One event in full, any status, for the edit dialog.
 *
 * Deliberately not getEvent() from events.js. That one is the public detail
 * endpoint and 404s anything unpublished - so opening the dialog on a draft or
 * a queued event would fail on exactly the rows moderation exists to look at.
 */
export const getEventForAdmin = (id) =>
  client.get(`/admin/events/${id}`).then((r) => r.data)

/**
 * Edit somebody else's event: the descriptive and scheduling fields.
 *
 * Same request body as the organiser's own PATCH. What it deliberately cannot
 * reach is pricing, zones, the seat map and the images - those stay on the
 * owner-scoped endpoints in events.js, because rewriting an organiser's
 * inventory underneath sold tickets is not moderation.
 */
export const updateEventAsAdmin = (id, payload) =>
  client.patch(`/admin/events/${id}`, payload).then((r) => r.data)

// --- organiser applications -------------------------------------------------
/*
 * The admin half of the become-an-organiser flow. The applicant's half lives in
 * organizerApplications.js, and the two stay apart for the reason that module's
 * own comment gives: neither audience should have to read the other's calls to
 * understand its own.
 */

/**
 * The pending queue: everyone still waiting, longest wait first.
 *
 * A plain array, not a Page - the server takes no paging parameters here. This
 * is a queue meant to be emptied, and a backlog long enough to need pages is a
 * signal to work it down rather than to scroll it.
 *
 * Takes an optional { status }, defaulting to PENDING server-side. Decided
 * applications used to be unreachable here on the reasoning that history wanted
 * a different screen - but the columns turned out to be the same ones, so the
 * status became a parameter rather than a second page.
 */
export const getOrganizerApplications = (params) =>
  client.get('/admin/organizer-applications', { params }).then((r) => r.data)

/**
 * How many applications sit in each status, as { PENDING: 2, APPROVED: 5, ... }.
 *
 * Same shape and same reasoning as getEventStatusCounts: the tabs show every
 * count while the list shows one status, so the numbers cannot be derived from
 * the page being displayed.
 */
export const getApplicationStatusCounts = () =>
  client.get('/admin/organizer-applications/status-counts').then((r) => r.data)

/**
 * Approve. The moment a customer becomes an organiser.
 *
 * No body: an approval has nothing to explain. By the time this resolves the
 * server has already flipped app_user.role and created the organizer_profile,
 * so the row that comes back is a record of the decision, not a request for it.
 */
export const approveApplication = (id) =>
  client.patch(`/admin/organizer-applications/${id}/approve`).then((r) => r.data)

/**
 * Reject, with a reason the applicant can act on.
 *
 * The message is required twice over - @Valid on the controller and a DB CHECK
 * behind it - so a blank one is a 400, not a silent rejection nobody can
 * explain. Rejection is terminal for this row but not for the person: they may
 * submit a fresh application afterwards.
 */
export const rejectApplication = (id, message) =>
  client.patch(`/admin/organizer-applications/${id}/reject`, { message }).then((r) => r.data)

// --- users ------------------------------------------------------------------
/*
 * The admin users screen. These replace mock/store.js's listUsers and
 * setUserDisabled, which filtered an in-memory array - so the screen showed
 * accounts that did not exist, and "disable" changed nothing about whether the
 * real person could log in.
 */

/**
 * Accounts matching the filter bar. Every parameter is optional and an omitted
 * one means "do not filter", so the untouched screen sends nothing at all.
 *
 * @param {{ q?: string, role?: string, disabled?: boolean }} params
 *        disabled is a tri-state: true for disabled only, false for active
 *        only, undefined for both. Passing false and omitting it are different
 *        questions, which is why the caller must not collapse them to a falsy
 *        check.
 */
export const getUsers = (params) =>
  client.get('/admin/users', { params }).then((r) => r.data)

/**
 * Lock an account out, or let it back in. Returns the updated user.
 *
 * Existing bookings and tickets are deliberately untouched by the server:
 * someone disabled mid-trip still holds a ticket a gate is going to scan.
 */
export const setUserDisabled = (id, disabled) =>
  client.patch(`/admin/users/${id}/${disabled ? 'disable' : 'enable'}`).then((r) => r.data)

/**
 * Edit an account: name, contact details and role. Returns the updated user.
 *
 * Wider than the self-service PATCH /auth/me by two fields, and both are the
 * point of the screen. Phone is the login identifier, which is exactly why its
 * owner may not change it and why an admin correcting a mistyped one must be
 * able to. Role is a decision the platform makes about a person, never the
 * person about themselves.
 *
 * Promoting someone to ORGANIZER also creates the organizer_profile row that
 * ownership hangs off, which is why org_name_en is required in that one case -
 * the server refuses the promotion without it rather than inventing a name that
 * would be printed on every event they publish.
 *
 * @param {{ display_name: string, email?: string, phone_e164?: string,
 *           role: string, org_name_en?: string, org_name_km?: string }} payload
 */
export const updateUser = (id, payload) =>
  client.patch(`/admin/users/${id}`, payload).then((r) => r.data)

/**
 * Erase an account. No body comes back.
 *
 * Only works on accounts that have never done anything - a spam signup, a
 * duplicate registration, a test account. Anything with a booking, a gate scan
 * or a review decision behind it answers 409 with a message naming what is
 * holding it down, and the answer for those is anonymizeUser.
 *
 * That refusal is not a limitation to work around. app_user is referenced by
 * fourteen columns and most of them have no ON DELETE clause, because the rows
 * on the other end are the organiser's sales and the platform's revenue as much
 * as they are one person's history.
 */
export const deleteUser = (id) => client.delete(`/admin/users/${id}`).then(() => undefined)

/**
 * Strip the person out of an account and leave the account standing. Returns
 * the updated user.
 *
 * Clears the name, phone, email, Telegram handle, credentials and photo, then
 * locks the account. The bookings, tickets and payments stay exactly where they
 * are - and so does the ticket somebody is carrying to a gate tomorrow, because
 * booking rows carry their own buyer_name and buyer_phone snapshotted at
 * checkout rather than joining to the account.
 *
 * Irreversible. There is no copy of the cleared values anywhere.
 */
export const anonymizeUser = (id) =>
  client.patch(`/admin/users/${id}/anonymize`).then((r) => r.data)

// --- payments ---------------------------------------------------------------

/**
 * Payment attempts across every organiser, newest first.
 *
 * @param {{ provider?: string, status?: string, eventId?: number, stuckOnly?: boolean }} params
 *        stuckOnly keeps only attempts still open an hour after they opened.
 *        The threshold is the server's, deliberately: it is a question about
 *        elapsed time, and a tab left open overnight answers it against a clock
 *        nobody has looked at since.
 */
export const getPayments = (params) =>
  client.get('/admin/payments', { params }).then((r) => r.data)

/**
 * Ask the provider about one attempt, now.
 *
 * POST, not a read: it can settle the payment, confirm the booking and issue
 * the tickets. Answers { checked, payment } - `checked` is false when the
 * provider was not contacted at all, which is a normal outcome rather than a
 * failure: the attempt may already have closed, or the per-provider rate floor
 * may say it is too soon to ask again.
 */
export const reconcilePayment = (id) =>
  client.post(`/admin/payments/${id}/reconcile`).then((r) => r.data)

/**
 * Attempts, settlements and failures per event - worst first.
 *
 * Not derivable from getPayments(): that returns one filtered view, and the
 * question this answers is a comparison across every event. The server sorts
 * it, because the order is the whole point of the panel.
 */
export const getPaymentHealthByEvent = () =>
  client.get('/admin/payments/by-event').then((r) => r.data)

// --- dashboard --------------------------------------------------------------

/** Every counter on the dashboard, in one request. */
export const getPlatformStats = () =>
  client.get('/admin/stats').then((r) => r.data)

/** The latest-bookings strip. Server caps limit at 50. */
export const getRecentBookings = (limit = 8) =>
  client.get('/admin/stats/recent-bookings', { params: { limit } }).then((r) => r.data)

/**
 * The latest-events strip, newest listing first. Server caps limit at 50.
 *
 * Deliberately not getEventsOverview({ ... }).slice(): that one returns every
 * event on the platform with five aggregates attached, sorted by show date -
 * so filling an eight-row strip would mean fetching the whole moderation table
 * and throwing away the sort it came in. Drafts are excluded here for the same
 * reason they are there: an organiser's private workspace is not platform news.
 */
export const getRecentEvents = (limit = 8) =>
  client.get('/admin/stats/recent-events', { params: { limit } }).then((r) => r.data)

// --- moderation table -------------------------------------------------------

/**
 * Every event on the platform, any owner, any status.
 *
 * Deliberately not getReviewQueue: that one defaults to PENDING_REVIEW and
 * answers "what is waiting for me". This answers "what is on the platform" and
 * applies no status filter unless asked, which is the difference between the
 * queue screen and the moderation table.
 *
 * @param {{ q?: string, status?: string, province?: string }} params
 */
export const getEventsOverview = (params) =>
  client.get('/admin/events/overview', { params }).then((r) => r.data)
