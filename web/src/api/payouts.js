import client from './client.js'

/**
 * Getting organisers paid.
 *
 * Both halves live here, unlike organizerApplications.js which deliberately
 * left the admin side elsewhere. The difference is that these two audiences
 * read the same row through the same lens: the admin queue and the organiser's
 * history render identical fields off identical payloads, and splitting them
 * would mean maintaining one response shape from two files.
 *
 * Every field crosses the wire in snake_case - the API sets
 * property-naming-strategy: SNAKE_CASE, which applies to request bodies as well
 * as responses.
 */

/* ------------------------------------------------------------- organiser */

/**
 * Finished events this organiser could claim, with what each is currently
 * worth.
 *
 * A quote, not an invoice: these numbers are computed live and keep moving
 * until a request freezes them. Events already claimed, and events that
 * finished owing nothing, are not returned at all - the only thing clicking
 * one could do is fail.
 */
export const getPayableEvents = () =>
  client.get('/organizer/payouts/payable').then((r) => r.data)

/**
 * Claim one finished event. 201 with the created payout.
 *
 * No amount is sent. The server works out what the event earned; a request that
 * named its own total would either be trusted, which is a form anyone can type
 * a million dollars into, or checked against the real figure anyway.
 *
 * Fails with 409 and one of PAYOUT_ALREADY_REQUESTED, EVENT_NOT_FINISHED or
 * NOTHING_TO_PAY_OUT. All three are reachable by a stale screen, so the caller
 * should read the code rather than assume its own state was accurate.
 */
export const requestPayout = (data) =>
  client
    .post('/organizer/payouts', {
      event_id: data.event_id,
      payout_method: data.payout_method,
      account_name: data.account_name,
      account_number: data.account_number,
      note: data.note || null,
    })
    .then((r) => r.data)

/** This organiser's payouts, newest first. Optionally one status only. */
export const getMyPayouts = (status) =>
  client
    .get('/organizer/payouts', { params: status ? { status } : {} })
    .then((r) => r.data)

/**
 * One payout, for the invoice page.
 *
 * Returns an unmasked account number, and only to the organiser it belongs to.
 * A miss comes back 404 rather than 403 even when the row exists and belongs to
 * somebody else - invoice numbers are sequential, so confirming an id would let
 * anyone walk the run.
 */
export const getMyPayout = (id) =>
  client.get(`/organizer/payouts/${id}`).then((r) => r.data)

/* ----------------------------------------------------------------- admin */

/** One status' worth, longest wait first. Defaults to REQUESTED server-side. */
export const getAdminPayouts = (status) =>
  client
    .get('/admin/payouts', { params: status ? { status } : {} })
    .then((r) => r.data)

/** The numbers on the tabs. Every status present, including the empty ones. */
export const getAdminPayoutCounts = () =>
  client.get('/admin/payouts/status-counts').then((r) => r.data)

/** One payout in full, account number included - what the transfer is made from. */
export const getAdminPayout = (id) =>
  client.get(`/admin/payouts/${id}`).then((r) => r.data)

/**
 * Agree the platform owes this. No money moves; see markPayoutPaid.
 *
 * There is no counterpart. An admin who does not intend to pay a request simply
 * leaves it in REQUESTED - nothing in the flow forces a decision either way.
 */
export const approvePayout = (id) =>
  client.patch(`/admin/payouts/${id}/approve`).then((r) => r.data)

/**
 * Record that the transfer happened.
 *
 * Only legal from APPROVED - a 409 PAYOUT_ALREADY_DECIDED otherwise. The
 * reference is required: without it "paid" is a claim nobody can check.
 */
export const markPayoutPaid = (id, reference, note) =>
  client
    .patch(`/admin/payouts/${id}/mark-paid`, { reference, note: note || null })
    .then((r) => r.data)

/**
 * Basis points as a percentage a person reads: 1000 → "10%", 250 → "2.5%".
 *
 * Here rather than in each page because three screens print the fee line and a
 * second copy of this would eventually round differently from the first.
 */
export const feePercent = (bps) => {
  if (bps == null) return ''
  return `${Number((bps / 100).toFixed(2))}%`
}

/** How each payout state reads on a card. The badge colour comes from `s-${status}`. */
export const PAYOUT_STATUSES = ['REQUESTED', 'APPROVED', 'PAID']
