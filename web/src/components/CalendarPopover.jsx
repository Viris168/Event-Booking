import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * Two modes. "date" is a calendar: picking a day is the whole answer, so it
 * closes. "datetime" adds hour and minute columns beside the calendar - the
 * same layout as Chrome's own date-and-time picker, which is what organisers
 * already know - and stays open until Done, since a day alone is half of it.
 *
 * Dates are "YYYY-MM-DD" strings in and out, the same as <input type="date">,
 * and are handled as LOCAL calendar days throughout. `new Date("2026-10-15")`
 * would parse as UTC midnight and show the previous day anywhere west of
 * Greenwich, so nothing here goes through that constructor.
 *
 * Rendered into <body> with fixed positioning, not inside the field: the
 * event form's schedule sits in a narrow side column and the admin edit
 * dialog scrolls, and either would clip an absolutely positioned popover.
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

const pad = (n) => String(n).padStart(2, "0");

/** 24-hour, matching how every time on the site is printed ("18:00"). */
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
/** Five-minute steps; an existing value off the grid is added back in. */
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

export function parseISODate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

export function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/**
 * One scrolling column of times. Arrow keys move the choice, and the chosen
 * cell is scrolled to the middle when the column first appears.
 */
function TimeColumn({ label, options, value, onChoose }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const col = ref.current;
    const sel = col?.querySelector('[aria-selected="true"]');
    // scrollTop, not scrollIntoView: the latter would also scroll the page.
    if (sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
    // Only on first show - after that the reader is the one scrolling.
  }, []);

  function onKey(e) {
    const i = options.indexOf(value);
    const next =
      e.key === "ArrowDown" ? options[Math.min(options.length - 1, i + 1)]
      : e.key === "ArrowUp" ? options[Math.max(0, i - 1)]
      : null;
    if (next == null) return;
    e.preventDefault();
    onChoose(next);
    // Keep the moving choice in view and focused.
    requestAnimationFrame(() => {
      const el = ref.current?.querySelector(`[data-v="${next}"]`);
      el?.focus({ preventScroll: true });
      if (el) {
        const col = ref.current;
        if (el.offsetTop < col.scrollTop) col.scrollTop = el.offsetTop;
        else if (el.offsetTop + el.offsetHeight > col.scrollTop + col.clientHeight)
          col.scrollTop = el.offsetTop + el.offsetHeight - col.clientHeight;
      }
    });
  }

  return (
    <div
      ref={ref}
      className="cal-time-col"
      role="listbox"
      aria-label={label}
      onKeyDown={onKey}
    >
      {options.map((o) => {
        const sel = o === value;
        return (
          <button
            key={o}
            type="button"
            role="option"
            data-v={o}
            aria-selected={sel}
            tabIndex={sel || (value == null && o === options[0]) ? 0 : -1}
            className={`cal-time-opt${sel ? " is-selected" : ""}`}
            onClick={() => onChoose(o)}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function CalendarPopover({
  value,
  min,
  max,
  locale,
  anchorRef,
  popRef,
  withTime = false,
  time,
  onTime,
  onPick,
  onDone,
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
  const [pos, setPos] = useState(null);

  const setRoot = useCallback(
    (el) => {
      rootRef.current = el;
      if (popRef) popRef.current = el;
    },
    [popRef],
  );

  // Waits for `ready`: the first render is invisible while it measures where
  // to open, and a hidden element cannot take focus - so on open the day
  // would silently stay unfocused. Keyed on the boolean, not the position,
  // so a scroll that re-places the popover does not pull focus back here.
  const ready = pos !== null;
  useEffect(() => {
    if (!ready || !moveFocusRef.current) return;
    gridRef.current?.querySelector('[data-focus="true"]')?.focus();
  }, [focus, ready]);

  // Under the field, left-aligned - unless that would leave the viewport, in
  // which case align to the field's right edge and/or open upward. Measured
  // before paint and again on any scroll or resize, so it stays attached to
  // the field when the page or a dialog body scrolls under it.
  const place = useCallback(() => {
    const el = rootRef.current;
    const anchor = anchorRef?.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let left = a.left;
    if (left + w > vw - 8) left = Math.max(8, Math.min(a.right, vw - 8) - w);
    let top = a.bottom + 6;
    if (top + h > vh - 8 && a.top - h - 6 >= 8) top = a.top - h - 6;
    setPos({ top, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

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

  const [hh, mm] = time ? time.split(":") : [null, null];
  const minutes = mm && !MINUTES.includes(mm) ? [...MINUTES, mm].sort() : MINUTES;

  function go(d, fromKeyboard) {
    moveFocusRef.current = fromKeyboard;
    setFocus(d);
  }

  function pick(d) {
    if (isDisabled(d)) return;
    moveFocusRef.current = false;
    setFocus(d);
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

  return createPortal(
    <div
      ref={setRoot}
      className={`cal${withTime ? " has-time" : ""}`}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
      role="dialog"
      aria-label={
        withTime
          ? km ? "ជ្រើសរើសថ្ងៃ និងម៉ោង" : "Choose a date and time"
          : km ? "ជ្រើសរើសថ្ងៃ" : "Choose a date"
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose(true);
        }
      }}
    >
      <div className="cal-body">
        <div className="cal-main">
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
        </div>

        {withTime && (
          <div className="cal-time">
            <div className="cal-time-head">
              <Icon name="clock" size={14} />
              <span>{km ? "ម៉ោង" : "Time"}</span>
            </div>
            <div className="cal-time-cols">
              <TimeColumn
                label={km ? "ម៉ោង" : "Hour"}
                options={HOURS}
                value={hh}
                onChoose={(h) => onTime(`${h}:${mm ?? "00"}`)}
              />
              <TimeColumn
                label={km ? "នាទី" : "Minute"}
                options={minutes}
                value={mm}
                onChoose={(m) => onTime(`${hh ?? "09"}:${m}`)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="cal-foot">
        <button type="button" className="cal-link" onClick={() => onPick("")}>
          {km ? "សម្អាត" : "Clear"}
        </button>
        {withTime ? (
          <button type="button" className="cal-done" onClick={onDone}>
            {km ? "រួចរាល់" : "Done"}
          </button>
        ) : (
          <button
            type="button"
            className="cal-link"
            disabled={isDisabled(today)}
            onClick={() => pick(today)}
          >
            {km ? "ថ្ងៃនេះ" : "Today"}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
