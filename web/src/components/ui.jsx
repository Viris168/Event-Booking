// Small shared presentational pieces used across all three role areas.

import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { khr, khrFromUsdCents, usd } from '../lib/format.js'

/** Booking / event / payment status pill. Every state gets its own colour. */
export function Badge({ status, children, className = '' }) {
  const { status: label } = useLocale()
  return (
    <span className={`badge s-${status} ${className}`}>
      <i className="dot" aria-hidden="true" />
      {children || label(status)}
    </span>
  )
}

/** Dual-currency price. `stacked` puts KHR on its own line (card foot, totals). */
export function Money({ cents, rate, stacked = false, className = '' }) {
  const riel = khr(khrFromUsdCents(cents, rate))
  if (stacked) {
    return (
      <span className={className}>
        <b>{usd(cents)}</b>
        <span className="khr">{riel}</span>
      </span>
    )
  }
  return (
    <span className={`nowrap ${className}`}>
      {usd(cents)} <span className="khr muted">· {riel}</span>
    </span>
  )
}

export function Alert({ tone = 'info', icon, title, children, actions }) {
  const fallback = { info: 'info', warn: 'clock', danger: 'alert', success: 'checkCircle' }[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="alert-icon">
        <Icon name={icon || fallback} size={17} />
      </span>
      <div className="grow">
        {title && <b>{title}</b>}
        {children}
        {actions && <div className="row" style={{ marginTop: '0.6rem' }}>{actions}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon = 'ticket', title, children }) {
  return (
    <div className="empty">
      <span className="icon-chip lg plain" style={{ marginBottom: '0.7rem' }}>
        <Icon name={icon} size={22} />
      </span>
      <p className="strong">{title}</p>
      {children && <p className="small">{children}</p>}
    </div>
  )
}

export function Stat({ label, value, sub, icon, tone = '', alert = false }) {
  return (
    <div className={`stat ${alert ? 'stat-flagged' : ''}`}>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className={`icon-chip ${alert ? 'gold' : tone}`}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

/** Sold (solid) + held (gold) against capacity. */
export function Progress({ sold = 0, held = 0, capacity = 0 }) {
  const pct = (n) => (capacity ? Math.min(100, (n / capacity) * 100) : 0)
  return (
    <div className="progress" role="img" aria-label={`${sold} sold of ${capacity}`}>
      <i style={{ width: `${pct(sold)}%` }} />
      <i className="held" style={{ width: `${pct(held)}%` }} />
    </div>
  )
}

export function Field({ label, hint, error, optional, children, className = '' }) {
  const { t } = useLocale()
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="label">
          {label} {optional && <span className="opt">({t('optional')})</span>}
        </label>
      )}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

/** Text input with a leading icon and a clear button once it has a value. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  icon = 'search',
  ariaLabel,
  clearLabel = 'Clear',
  className = '',
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
        <button type="button" className="clear-btn" onClick={() => onChange('')} aria-label={clearLabel}>
          <Icon name="close" size={13} strokeWidth={2.25} />
        </button>
      ) : null}
    </span>
  )
}

/** Select with a leading icon; the chevron comes from the stylesheet. */
export function IconSelect({ value, onChange, icon, ariaLabel, children, className = '' }) {
  return (
    <span className={`field-icon ${className}`}>
      {icon && <Icon name={icon} size={16} />}
      <select
        className="select"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </span>
  )
}

/** Removable chips summarising the filters currently narrowing a result set. */
export function ActiveFilters({ items, onClearAll, clearAllLabel = 'Clear all' }) {
  if (!items.length) return null
  return (
    <div className="active-filters">
      {items.map((f) => (
        <span className="filter-pill" key={f.key}>
          {f.icon && <Icon name={f.icon} size={12} />}
          {f.label}
          <button type="button" onClick={f.onRemove} aria-label={`Remove ${f.label}`}>
            <Icon name="close" size={11} strokeWidth={2.5} />
          </button>
        </span>
      ))}
      {onClearAll && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClearAll}>
          <Icon name="close" size={13} />
          {clearAllLabel}
        </button>
      )}
    </div>
  )
}

export function Steps({ current, labels }) {
  return (
    <div className="steps">
      {labels.map((label, i) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {i > 0 && <span className="sep" aria-hidden="true" />}
          <span className={`step ${i === current ? 'active' : i < current ? 'done' : ''}`}>
            <i aria-hidden="true">{i < current ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}</i>
            {label}
          </span>
        </span>
      ))}
    </div>
  )
}

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null
  const nums = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <nav className="pager" aria-label="Pagination">
      <button onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">
        <Icon name="chevronLeft" size={15} />
      </button>
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className="muted small">
            …
          </span>
        ) : (
          <button key={n} aria-current={n === page} onClick={() => onChange(n)}>
            {n}
          </button>
        ),
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === pages} aria-label="Next page">
        <Icon name="chevronRight" size={15} />
      </button>
    </nav>
  )
}

/** Bilingual heading pair: primary in the active locale, other script beneath. */
export function BiTitle({ record, field = 'title', as: Tag = 'h1' }) {
  const { locale } = useLocale()
  const primary = record?.[`${field}_${locale}`] || record?.[`${field}_en`]
  const secondary = locale === 'en' ? record?.[`${field}_km`] : record?.[`${field}_en`]
  return (
    <>
      <Tag>{primary}</Tag>
      {secondary && secondary !== primary && (
        <div className={locale === 'en' ? 'km-title km' : 'km-title'}>{secondary}</div>
      )}
    </>
  )
}
