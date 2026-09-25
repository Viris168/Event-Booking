/*
 * When a ticket stops being usable at the gate.
 *
 * There is no ends_at on an event, and "past" elsewhere means starts_at has
 * gone by. That is too early for a ticket: an 18:00 concert would lock out
 * anyone arriving at 18:05. So a ticket lasts until the end of the event's day
 * in Cambodia, the same rule TicketService applies at the scanner.
 *
 * Cambodia is UTC+7 all year with no daylight saving, so a fixed offset is
 * exact and does not depend on the viewer's own timezone.
 */
const KH_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms at which tickets for an event starting at `startsAt` expire. */
export function ticketsExpireAt(startsAt) {
  if (!startsAt) return null;
  const ts = new Date(startsAt).getTime();
  if (Number.isNaN(ts)) return null;
  const khDayStart = Math.floor((ts + KH_OFFSET_MS) / DAY_MS) * DAY_MS;
  return khDayStart + DAY_MS - KH_OFFSET_MS;
}

/** True once the event's day is over. An unknown date is never expired. */
export function ticketsExpired(event, now = Date.now()) {
  const at = ticketsExpireAt(event?.starts_at);
  return at != null && now >= at;
}
