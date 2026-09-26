/*
 * When a ticket stops being usable at the gate.
 *
 * There is no ends_at on an event, and "past" elsewhere means starts_at has
 * gone by. That is too early for a ticket: an 18:00 concert would lock out
 * anyone arriving at 18:05. Midnight is too early as well - a New Year
 * countdown at 22:00 on 31 December would refuse everyone arriving at 00:05.
 * So a ticket lasts until 06:00 the morning after the event's day in Cambodia,
 * the same rule TicketService applies at the scanner.
 *
 * Cambodia is UTC+7 all year with no daylight saving, so a fixed offset is
 * exact and does not depend on the viewer's own timezone.
 */
const HOUR_MS = 60 * 60 * 1000;
const KH_OFFSET_MS = 7 * HOUR_MS;
const DAY_MS = 24 * HOUR_MS;
/** How far into the next morning an event's tickets keep working. */
const GRACE_MS = 6 * HOUR_MS;

/** Epoch ms of midnight (Cambodia) starting the day that contains `ts`. */
function khDayStart(ts) {
  return Math.floor((ts + KH_OFFSET_MS) / DAY_MS) * DAY_MS - KH_OFFSET_MS;
}

/** Epoch ms at which tickets for an event starting at `startsAt` expire. */
export function ticketsExpireAt(startsAt) {
  if (!startsAt) return null;
  const ts = new Date(startsAt).getTime();
  if (Number.isNaN(ts)) return null;
  return khDayStart(ts) + DAY_MS + GRACE_MS;
}

/** True once the event is over for the gate. An unknown date is never expired. */
export function ticketsExpired(event, now = Date.now()) {
  const at = ticketsExpireAt(event?.starts_at);
  return at != null && now >= at;
}

/**
 * True when `now` falls in the event's own gate window: its day, plus the
 * early hours after it until tickets lapse. So at 00:30 on 1 January, last
 * night's countdown is still "today", which is what a steward means by it.
 */
export function isEventDay(event, now = Date.now()) {
  const at = ticketsExpireAt(event?.starts_at);
  return at != null && at === khDayStart(now - GRACE_MS) + DAY_MS + GRACE_MS;
}
