// Small shared presentational pieces used across all three role areas.

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { usd } from "../lib/format.js";

/** Booking / event / payment status pill. Every state gets its own colour. */
export function Badge({ status, children, className = "" }) {
  const { status: label } = useLocale();
  return (
    <span className={`badge s-${status} ${className}`}>
      <i className="dot" aria-hidden="true" />
      {children || label(status)}
    </span>
  );
}

/** Prices are quoted and charged in USD only. */
export function Money({ cents, stacked = false, className = "" }) {
  if (stacked) {
    return (
      <span className={className}>
        <b>{usd(cents)}</b>
      </span>
    );
  }
  return <span className={`whitespace-nowrap ${className}`}>{usd(cents)}</span>;
}

export function Alert({ tone = "info", icon, title, children, actions }) {
  const fallback = {
    info: "info",
    warn: "clock",
    danger: "alert",
    success: "checkCircle",
  }[tone];
  return (
    <div
      className={`alert alert-${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className="alert-icon">
        <Icon name={icon || fallback} size={17} />
      </span>
      <div className="flex-auto min-w-0">
        {title && <b>{title}</b>}
        {children}
        {actions && (
          <div className="row" style={{ marginTop: "0.6rem" }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * An empty or failed region: icon, title, a line of explanation, then
 * `actions` on a row of their own.
 *
 * <p>Buttons go in `actions`, not `children`. The children sit in a text
 * block, and a button there is inline-flex, so it ran on at the end of the
 * sentence ("...Please try again.[Retry]") - every call site then nudged it
 * with its own marginTop, which could not fix a line it was still part of.
 */
export function Empty({ icon = "ticket", title, children, actions }) {
  return (
    <div className="empty">
      <span className="icon-chip lg plain" style={{ marginBottom: "0.7rem" }}>
        <Icon name={icon} size={22} />
      </span>
      <p className="font-bold">{title}</p>
      {children && <div className="small">{children}</div>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

/**
 * One figure on a dashboard.
 *
 * <p>Pass `to` and the whole tile becomes the link to the screen that figure
 * belongs to. That is for the tiles that count work waiting - a reader who sees
 * "4 need review" wants the review queue, and making them find it in the nav
 * afterwards is a step for nothing. Tiles that merely report, like a user
 * count, take no `to`: there is nothing to do about them.
 */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "",
  alert = false,
  to,
}) {
  const Box = to ? Link : "div";
  return (
    <Box
      className={`stat ${alert ? "stat-flagged" : ""} ${to ? "stat-link" : ""}`}
      to={to}
    >
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className={`icon-chip ${alert ? "gold" : tone}`}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Box>
  );
}

/** Sold (solid) + held (gold) against capacity. */
export function Progress({ sold = 0, held = 0, capacity = 0 }) {
  const pct = (n) => (capacity ? Math.min(100, (n / capacity) * 100) : 0);
  return (
    <div
      className="progress"
      role="img"
      aria-label={`${sold} sold of ${capacity}`}
    >
      <i style={{ width: `${pct(sold)}%` }} />
      <i className="held" style={{ width: `${pct(held)}%` }} />
    </div>
  );
}

/**
 * A labelled form row.
 *
 * <p>Pass `htmlFor` with the id of the control inside and the label is bound to
 * it: clicking the words focuses the field, and a screen reader reads the two
 * as one thing. Without it a `<label>` is just styled text sitting near an
 * input — which is what every one of these was. The same id also ties the hint
 * or error underneath to the control through `aria-describedby`, so "e.g. 012
 * 345 678", and more importantly a validation failure, are announced instead of
 * being visible only to people who can see them.
 *
 * <p>Optional, so the fields that have not been given ids yet are unchanged.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className = "",
}) {
  const { t } = useLocale();
  const messageId = htmlFor ? `${htmlFor}-message` : undefined;
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label} {optional && <span className="opt">({t("optional")})</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="err" id={messageId}>
          {error}
        </span>
      ) : hint ? (
        <span className="hint" id={messageId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Text input with a leading icon and a clear button once it has a value. */
/**
 * A date or date-and-time field that looks and behaves the same everywhere.
 *
 * <p>The native control is kept - it is what brings up the phone's own wheel
 * or the desktop calendar - but every browser draws it differently, and iOS
 * Safari draws it worst:
 * <ul>
 *   <li>it gives the field an intrinsic minimum width that ignores its column,
 *       so two side by side overflow into each other and off the screen;
 *   <li>an empty one is a blank box - no placeholder, no icon, nothing saying
 *       it is a date at all;
 *   <li>a filled one centres its value, unlike every other field.
 * </ul>
 * Desktop Chrome and Firefox have the opposite problem: an empty field prints
 * a "mm/dd/yyyy" mask in the reader's system locale, whatever language the
 * page is in.
 *
 * <p>So the field is drawn by us: our calendar icon on the right, and our own
 * placeholder while it is empty - hidden the moment it is focused, so the
 * browser's own editing (segments, wheel, calendar) takes over untouched.
 * The value and `onChange` are the native input's own, so it is a drop-in
 * replacement for `<input className="input" type="date">`.
 */
export function DateInput({
  type = "date",
  value,
  placeholder,
  className = "",
  ...rest
}) {
  const { locale } = useLocale();
  const km = locale === "km";
  const hint =
    placeholder ??
    (type === "date"
      ? km
        ? "ជ្រើសរើសថ្ងៃ"
        : "Select date"
      : km
        ? "ជ្រើសរើសថ្ងៃ និងម៉ោង"
        : "Select date & time");
  const empty = !value;
  return (
    <span className={`date-input${empty ? " is-empty" : ""}`}>
      <input
        className={`input ${className}`}
        type={type}
        value={value ?? ""}
        {...rest}
      />
      <Icon name="calendar" size={16} className="date-input-icon" />
      {empty && (
        <span className="date-input-hint" aria-hidden="true">
          {hint}
        </span>
      )}
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  icon = "search",
  ariaLabel,
  clearLabel = "Clear",
  className = "",
}) {
  return (
    <span className={`field-icon ${className}`}>
      <Icon name={icon} size={16} />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="clear-btn"
          onClick={() => onChange("")}
          aria-label={clearLabel}
        >
          <Icon name="close" size={13} strokeWidth={2.25} />
        </button>
      ) : null}
    </span>
  );
}

function extractSelectOptions(children) {
  const result = [];
  const walk = (nodes) => {
    Children.forEach(nodes, (node) => {
      if (!node) return;
      if (node.type === "option") {
        result.push({
          value: node.props?.value ?? "",
          label: node.props?.children ?? node.props?.value ?? "",
          disabled: Boolean(node.props?.disabled),
        });
      } else if (node.props?.children) {
        walk(node.props.children);
      }
    });
  };
  walk(children);
  return result;
}

/** Custom styled select with leading icon, smooth animated chevron, and rich popover menu. */
export function IconSelect({
  value,
  onChange,
  icon,
  ariaLabel,
  children,
  className = "",
  placeholder = "",
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const options = extractSelectOptions(children);
  const selectedOption = options.find((o) => String(o.value) === String(value));
  const currentLabel = selectedOption
    ? selectedOption.label
    : options[0]?.label || placeholder || "";

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`field-icon custom-select-wrap ${className} ${open ? "is-open" : ""}`}
    >
      {icon && (
        <span className="custom-select-icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
      )}
      <button
        type="button"
        className={`select custom-select-trigger ${open ? "is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="custom-select-label">{currentLabel}</span>
        <span
          className={`custom-select-chevron ${open ? "is-flipped" : ""}`}
          aria-hidden="true"
        >
          <Icon name="chevronDown" size={14} />
        </span>
      </button>

      {/* Visually-hidden native select for accessibility and form integration */}
      <select
        className="custom-select-hidden"
        value={value}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {children}
      </select>

      {open && (
        <div
          className="custom-select-menu"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((opt, index) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <button
                type="button"
                key={`${opt.value}-${index}`}
                className={`custom-select-option ${isSelected ? "is-selected" : ""}`}
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
              >
                <span className="custom-select-option-text">{opt.label}</span>
                {isSelected && (
                  <span className="custom-select-check" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Two-thumb range, used for the price filter.
 *
 * <p>Built from two real `<input type="range">` elements stacked on one track,
 * rather than a div with pointer handlers. Each thumb then keeps the keyboard
 * support and the announced value the platform already gives it — arrows,
 * Home/End, page keys — which a hand-rolled control has to rebuild and usually
 * gets wrong. The inputs themselves are transparent and only their thumbs take
 * pointer events, so the visible track and fill underneath can be styled.
 *
 * <p>`value` is [low, high]; either thumb pushing past the other is clamped
 * rather than allowed to invert the pair.
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  lowLabel,
  highLabel,
}) {
  const [low, high] = value;
  const pct = (n) => ((n - min) / (max - min)) * 100;
  return (
    <div className="range">
      <div className="range-track">
        <div
          className="range-fill"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={low}
        aria-label={lowLabel}
        onChange={(e) =>
          onChange([Math.min(Number(e.target.value), high), high])
        }
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={high}
        aria-label={highLabel}
        onChange={(e) => onChange([low, Math.max(Number(e.target.value), low)])}
      />
    </div>
  );
}

/** Removable chips summarising the filters currently narrowing a result set. */
export function ActiveFilters({
  items,
  onClearAll,
  clearAllLabel = "Clear all",
}) {
  if (!items.length) return null;
  return (
    <div className="active-filters">
      {items.map((f) => (
        <span className="filter-pill" key={f.key}>
          {f.icon && <Icon name={f.icon} size={12} />}
          {f.label}
          <button
            type="button"
            onClick={f.onRemove}
            aria-label={`Remove ${f.label}`}
          >
            <Icon name="close" size={11} strokeWidth={2.5} />
          </button>
        </span>
      ))}
      {onClearAll && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onClearAll}
        >
          <Icon name="close" size={13} />
          {clearAllLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Table wrapper that survives narrow screens.
 *
 * Wide viewports get the normal table. Below 900px (iPad portrait and every
 * phone) the stylesheet stacks each row into a labelled card — reading a row
 * top-to-bottom beats scrolling a 7-column grid sideways.
 *
 * The labels are mirrored from the column headers after each render rather than
 * hand-written per cell, so they can never drift from the `<th>`s and they
 * follow the EN/KM toggle for free.
 */
export function ResponsiveTable({ children, className = "" }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const table = ref.current?.querySelector("table");
    if (!table) return;
    const heads = [...table.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim(),
    );
    if (!heads.length) return;
    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = [...row.children];
      // Full-width rows (empty states, expanded detail) stay unlabelled.
      const labelled = cells.length === heads.length;
      cells.forEach((cell, i) => {
        if (labelled && heads[i]) cell.setAttribute("data-label", heads[i]);
        else cell.removeAttribute("data-label");
      });
    }
  });

  return (
    <div className={`table-wrap ${className}`} ref={ref}>
      {children}
    </div>
  );
}

export function Steps({ current, labels }) {
  return (
    <div className="steps">
      {labels.map((label, i) => (
        <span
          key={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          {i > 0 && <span className="sep" aria-hidden="true" />}
          <span
            className={`step ${i === current ? "active" : i < current ? "done" : ""}`}
          >
            <i aria-hidden="true">
              {i < current ? (
                <Icon name="check" size={11} strokeWidth={3} />
              ) : (
                i + 1
              )}
            </i>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The page sizes the bar below offers. */
const PAGE_SIZES = [25, 50, 100];

/**
 * The footer bar on a long table: how many rows per page, and which page.
 *
 * Distinct from {@link Pager} below, which is a row of numbered buttons for
 * browsing a catalogue - you go to page 7 of the events list because page 7 is
 * where you were. Nobody browses the admin tables that way. What they do is
 * work down a queue, so this offers a bigger page rather than a way to jump to
 * a numbered one, and spends its width on the size control instead.
 *
 * Presentational and controlled: it holds no state and does not care whether
 * the caller slices an array in the browser (usePaging) or asks the server for
 * one page (OrganizerTransactionsPage). Both render this.
 *
 * Renders nothing at all when there is one page at the smallest size - a pager
 * under nine rows is furniture that only says "there is no more".
 */
export function TablePager({
  page,
  pages,
  pageSize,
  onPage,
  onPageSize,
  sizes = PAGE_SIZES,
}) {
  const { locale } = useLocale();
  const km = locale === "km";
  if (pages <= 1 && pageSize <= sizes[0]) return null;

  return (
    <div className="table-pager">
      <div className="flex items-center gap-2">
        <div className="pager-sizes">
          {sizes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPageSize(n)}
              aria-pressed={pageSize === n}
              className={pageSize === n ? "active" : ""}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-small text-muted">
          {km ? "ក្នុងមួយទំព័រ" : "per page"}
        </span>
      </div>

      <div className="flex items-center gap-2 text-small text-muted">
        <span>
          {km ? "ទំព័រ" : "Page"}{" "}
          <b className="text-ink tabular-nums">{page}</b> {km ? "នៃ" : "of"}{" "}
          <b className="text-ink tabular-nums">{pages}</b>
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label={km ? "ទំព័រមុន" : "Previous page"}
        >
          <Icon name="chevronLeft" size={15} />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label={km ? "ទំព័របន្ទាប់" : "Next page"}
        >
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <nav className="pager" aria-label="Pagination">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <Icon name="chevronLeft" size={15} />
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`gap-${i}`} className="muted small">
            …
          </span>
        ) : (
          <button key={n} aria-current={n === page} onClick={() => onChange(n)}>
            {n}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === pages}
        aria-label="Next page"
      >
        <Icon name="chevronRight" size={15} />
      </button>
    </nav>
  );
}

/** Bilingual heading pair: primary in the active locale, other script beneath. */
export function BiTitle({ record, field = "title", as: Tag = "h1" }) {
  const { locale } = useLocale();
  const primary = record?.[`${field}_${locale}`] || record?.[`${field}_en`];
  const secondary =
    locale === "en" ? record?.[`${field}_km`] : record?.[`${field}_en`];
  return (
    <>
      <Tag>{primary}</Tag>
      {secondary && secondary !== primary && (
        <div className={locale === "en" ? "km-title km" : "km-title"}>
          {secondary}
        </div>
      )}
    </>
  );
}
