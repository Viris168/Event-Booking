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
 * Decided applications are deliberately unreachable from this endpoint: there
 * is no status filter, so a screen that wants history needs a different call.
 */
export const getOrganizerApplications = () =>
  client.get('/admin/organizer-applications').then((r) => r.data)

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

// --- payments ---------------------------------------------------------------

/**
 * Payment attempts across every organiser, newest first.
 *
 * @param {{ provider?: string, status?: string, stuckOnly?: boolean }} params
 *        stuckOnly keeps only attempts still open an hour after they opened.
 *        The threshold is the server's, deliberately: it is a question about
 *        elapsed time, and a tab left open overnight answers it against a clock
 *        nobody has looked at since.
 */
export const getPayments = (params) =>
  client.get('/admin/payments', { params }).then((r) => r.data)

// --- dashboard --------------------------------------------------------------

/** Every counter on the dashboard, in one request. */
export const getPlatformStats = () =>
  client.get('/admin/stats').then((r) => r.data)

/** The latest-bookings strip. Server caps limit at 50. */
export const getRecentBookings = (limit = 8) =>
  client.get('/admin/stats/recent-bookings', { params: { limit } }).then((r) => r.data)

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
