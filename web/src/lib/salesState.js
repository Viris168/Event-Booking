/*
 * What an event's SALES state is, as opposed to its lifecycle status.
 *
 * Shared by the organiser dashboard and the admin moderation table. Both show a
 * status column that answers "what did the organiser decide" - Draft, Published,
 * Taken down - and neither could tell a live event from one whose sales shut a
 * month ago, because both read "Published".
 *
 * Derived at render time rather than stored. A stored column is only as correct
 * as the last time a job ran, and would go stale the moment an organiser edits
 * their sales window; this cannot.
 *
 * The two field spellings are deliberate: the organiser's payload carries
 * total_sold / total_capacity, the admin overview carries sold / capacity.
 */

/**
 * Where an event stands in its SALES window, which the lifecycle badge does not
 * say.
 *
 * <p>"Published" is the organiser's own release decision and stops being news
 * the moment they make it. What they actually need to know afterwards is
 * whether the thing is currently taking money - and a published event can be
 * any of five different answers to that, none of them visible until now.
 *
 * <p>The order is the seed's own (dev-seed-all.sql), so the dashboard and the
 * fixtures describe events the same way: a finished event is "over" whatever
 * its window says, and an event whose sales never opened is not "closed".
 * `soldOut` is the one addition - the seed has no reason to care, an organiser
 * very much does.
 *
 * <p>Returns null for anything that was never on sale. A draft's lifecycle
 * badge already says everything there is to say, and a second pill repeating
 * "not selling" would be noise on the rows that need the least of it.
 */
export function salesState(e) {
  if (e.status !== 'PUBLISHED' && e.status !== 'TAKEN_DOWN') return null

  const now = Date.now()
  const at = (v) => (v ? new Date(v).getTime() : null)
  const starts = at(e.starts_at)
  const opens = at(e.sales_open_at)
  const closes = at(e.sales_close_at)

  if (starts && starts <= now) return 'over'

  /*
   * A taken-down event that is still to come gets NO pill.
   *
   * The badge beside it already reads "Taken down"; a pill saying "Off sale"
   * next to it is the same fact in different words, and two labels for one
   * state make a reader look for a distinction that is not there. "Finished"
   * above is different - the badge cannot say that, which is why it is checked
   * first and still applies to a taken-down event.
   */
  if (e.status === 'TAKEN_DOWN') return null
  // Capacity reached beats the window: "sold out" is the answer an organiser is
  // looking for, and a sold-out event whose sales also closed is still sold out.
  const capacity = e.total_capacity ?? e.capacity ?? 0
  const sold = e.total_sold ?? e.sold ?? 0
  if (capacity > 0 && sold >= capacity) return 'soldOut'
  if (opens && opens > now) return 'notOpen'
  if (closes && closes < now) return 'closed'
  return 'onSale'
}

/**
 * Has this event already happened?
 *
 * <p>Module scope, like salesState above: reading the clock is an impure call
 * and the lint rule that polices those cannot tell that a helper called from
 * render is being asked for "now" on purpose. Keeping it here also means the
 * two places that decide what "past" means share one line rather than drifting.
 */
export function isPast(e) {
  return Boolean(e.starts_at) && new Date(e.starts_at).getTime() <= Date.now()
}

/** Wording and tone per sales state. `tone` keys the pill's colour. */
export const SALES_UI = {
  onSale:  { en: 'On sale',        km: 'កំពុងលក់',        tone: 'ok' },
  soldOut: { en: 'Sold out',       km: 'លក់អស់',          tone: 'warn' },
  notOpen: { en: 'Not on sale yet', km: 'មិនទាន់លក់',     tone: 'quiet' },
  closed:  { en: 'Sales closed',   km: 'បិទការលក់',       tone: 'quiet' },
  over:    { en: 'Finished',       km: 'បានបញ្ចប់',       tone: 'quiet' },
}

/**
 * What the status badge should SAY, which is not always the stored status.
 *
 * <p>A finished event keeps `status = PUBLISHED`: finishing is not a decision
 * anyone made, and overwriting the status would lose the record of the
 * organiser's actual release decision. But "Published" is read as "live on the
 * site", and a finished event is not - the catalogue lists from today onward,
 * so it disappeared the moment its date passed. The badge said one thing and
 * the product did another.
 *
 * <p>EVERY finished event reads "Finished", taken-down ones included. An
 * earlier version kept "Taken down · Finished" on the grounds that pulling a
 * listing is history worth showing - but by the time an event is over the
 * distinction has no consequence left: both are invisible to the public, both
 * refuse to be reopened, and neither needs anything from anybody. Two labels
 * for one outcome only make a reader look for a difference that is not there.
 *
 * <p>The history is not lost - `status` is untouched in the database and the
 * take-down still has its event_review row. It just stops being the headline on
 * a row whose headline is that the event has happened.
 */
export function displayStatus(e) {
  return isPast(e) ? 'FINISHED' : e.status
}
