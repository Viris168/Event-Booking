import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

/*
 * The calendar DateInput opens on desktop, in place of the browser's own.
 *
 * The native popup is drawn by the browser, outside the page, so no stylesheet
 * reaches it: it came up in Chrome's blue on a jade site, in English on a
 * Khmer page. This one is ours. Phones keep their native picker - see
 * DateInput - because the iOS wheel and the Android calendar are better under
 * a thumb than anything drawn in a page, and cannot be restyled either.
 *
 * Dates are "YYYY-MM-DD" strings in and out, the same as <input type="date">,
 * and are handled as LOCAL calendar days throughout. `new Date("2026-10-15")`
 * would parse as UTC midnight and show the previous day anywhere west of
 * Greenwich, so nothing here goes through that constructor.
 */

/** Short weekday headings, Sunday first. Khmer uses the customary abbreviations. */
const WEEKDAYS = {
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  km: ["អា", "ច", "អ", "ព", "ព្រ", "សុ", "ស"],
};

/* Khmer month names, spelled out rather than taken from Intl: a browser built
   without Khmer locale data (some Chromium builds) falls back to English
   there, which would leave an English month over Khmer weekday headings. */
const KM_MONTHS = [
  "មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា",
  "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ",
];

export function parseISODate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toISODate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const addDays = (d, n) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const sameDay = (a, b) =>
  !!a &&
  !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** The same day-of-month in another month, clamped to that month's length. */
function shiftMonth(d, n) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export default function CalendarPopover({
  value,
  min,
  max,
  locale,
  onPick,
  onClose,
}) {
  const km = locale === "km";
  const tag = km ? "km-KH" : "en-GB";
  const selected = parseISODate(value);
  const minD = parseISODate(min);
  const maxD = parseISODate(max);
  const today = startOfToday();
  const isDisabled = (d) => (minD && d < minD) || (maxD && d > maxD);

  // The day keyboard focus sits on, which is also what decides the month on
  // show: the chosen date, else today, else the nearest day that is allowed.
  const [focus, setFocus] = useState(() => {
    if (selected) return selected;
    if (minD && today < minD) return minD;
    if (maxD && today > maxD) return maxD;
    return today;
  });
  // Only a keyboard move pulls DOM focus into the grid. A click on the month
  // arrows should leave focus on the arrow, so it can be clicked again.
  const moveFocusRef = useRef(true);
  const rootRef = useRef(null);
  const gridRef = useRef(null);
  const [place, setPlace] = useState("");

  useEffect(() => {
    if (!moveFocusRef.current) return;
    gridRef.current?.querySelector('[data-focus="true"]')?.focus();
  }, [focus]);

  // Open below the field, left-aligned - unless that would run off the
  // viewport, in which case align to the field's right edge and/or open
  // upward. Measured once, before paint, so it never visibly jumps.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const field = el.parentElement.getBoundingClientRect();
    const cls = [];
    if (r.right > window.innerWidth - 8) cls.push("is-right");
    if (r.bottom > window.innerHeight - 8 && field.top > r.height + 16) cls.push("is-up");
    setPlace(cls.join(" "));
  }, []);

  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );
  const title = km
    ? `${KM_MONTHS[first.getMonth()]} ${first.getFullYear()}`
    : new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(first);
  const dayLabel = new Intl.DateTimeFormat(tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function go(d, fromKeyboard) {
    moveFocusRef.current = fromKeyboard;
    setFocus(d);
  }

  function pick(d) {
    if (isDisabled(d)) return;
    onPick(toISODate(d));
  }

  function onGridKey(e) {
    const moves = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => addDays(focus, -focus.getDay()),
      End: () => addDays(focus, 6 - focus.getDay()),
      PageUp: () => shiftMonth(focus, e.shiftKey ? -12 : -1),
      PageDown: () => shiftMonth(focus, e.shiftKey ? 12 : 1),
    };
    if (moves[e.key]) {
      e.preventDefault();
      go(moves[e.key](), true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`cal ${place}`}
      role="dialog"
      aria-label={km ? "ជ្រើសរើសថ្ងៃ" : "Choose a date"}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose(true);
        }
      }}
    >
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          onClick={() => go(shiftMonth(focus, -1), false)}
          aria-label={km ? "ខែមុន" : "Previous month"}
        >
          <Icon name="chevronLeft" size={16} />
        </button>
        <span className="cal-title" aria-live="polite">
          {title}
        </span>
        <button
          type="button"
          className="cal-nav"
          onClick={() => go(shiftMonth(focus, 1), false)}
          aria-label={km ? "ខែបន្ទាប់" : "Next month"}
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <table className="cal-grid" role="grid" ref={gridRef} onKeyDown={onGridKey}>
        <thead>
          <tr>
            {WEEKDAYS[km ? "km" : "en"].map((w) => (
              <th key={w} scope="col">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={toISODate(week[0])}>
              {week.map((d) => {
                const outside = d.getMonth() !== first.getMonth();
                const isSel = sameDay(d, selected);
                const isFocus = sameDay(d, focus);
                const cls = [
                  "cal-day",
                  outside && "is-outside",
                  sameDay(d, today) && "is-today",
                  isSel && "is-selected",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <td key={toISODate(d)} role="gridcell" aria-selected={isSel}>
                    <button
                      type="button"
                      className={cls}
                      tabIndex={isFocus ? 0 : -1}
                      data-focus={isFocus}
                      disabled={isDisabled(d)}
                      aria-label={dayLabel.format(d)}
                      aria-current={sameDay(d, today) ? "date" : undefined}
                      onClick={() => pick(d)}
                    >
                      {d.getDate()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cal-foot">
        <button type="button" className="cal-link" onClick={() => onPick("")}>
          {km ? "សម្អាត" : "Clear"}
        </button>
        <button
          type="button"
          className="cal-link"
          disabled={isDisabled(today)}
          onClick={() => pick(today)}
        >
          {km ? "ថ្ងៃនេះ" : "Today"}
        </button>
      </div>
    </div>
  );
}
