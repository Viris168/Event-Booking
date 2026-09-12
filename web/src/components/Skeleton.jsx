/**
 * Loading placeholders.
 *
 * Every screen that waits on the API renders the shape of what is coming
 * instead of a line of text: the page keeps its layout, so nothing jumps when
 * the data lands. The grey blocks come from `.skel` in the stylesheet (tinted
 * from theme tokens, so dark mode follows); everything else here is plain
 * Tailwind mirroring the real markup.
 *
 * Screen readers get one polite "Loading…" per region rather than a hundred
 * empty boxes — the placeholders themselves are hidden from them.
 */

import { useLocale } from '../context/LocaleContext.jsx'

/**
 * One grey block. Size it with utilities: `<Skeleton className="h-4 w-1/2" />`.
 *
 * `style` is for the sizes that cannot be utilities — a bar whose height is a
 * computed percentage, a cell whose width comes from a repeating pattern.
 * Prefer a class wherever one exists.
 */
export function Skeleton({ className = '', dark = false, style }) {
  return (
    <span
      className={`skel ${dark ? 'skel-dark' : ''} ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}

/** A paragraph of lines; the last one is short, the way real text ends. */
export function SkeletonText({ lines = 3, dark = false, className = '' }) {
  return (
    <span className={`skel-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className={`skel skel-line ${dark ? 'skel-dark' : ''}`}
          style={{ width: i === lines - 1 ? '55%' : '100%' }}
        />
      ))}
    </span>
  )
}

/**
 * Wraps a set of placeholders so assistive tech hears one announcement and
 * knows the region is still filling in.
 */
export function SkeletonRegion({ label, className = '', style, children }) {
  const { t } = useLocale()
  return (
    <div className={className} style={style} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label || t('loading')}</span>
      {children}
    </div>
  )
}

/** Panel with a heading row and a body — the shape most detail cards share. */
export function SkeletonPanel({ lines = 3, head = true, className = '' }) {
  return (
    <div className={`panel ${className}`} aria-hidden="true">
      {head && (
        <div className="panel-head">
          <Skeleton className="h-[0.95rem] w-32" />
          <Skeleton className="h-[0.95rem] w-16" />
        </div>
      )}
      <div className="panel-body">
        <SkeletonText lines={lines} />
      </div>
    </div>
  )
}

/** Mirrors EventCard: media band, title pair, two meta rows, price footer. */
export function EventCardSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card"
      aria-hidden="true"
    >
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-auto flex-col gap-[0.55rem] px-4 pt-[0.95rem]">
        <Skeleton className="h-[1.1rem] w-20 rounded-full" />
        <Skeleton className="skel-line lg w-[85%]" />
        <Skeleton className="skel-line w-[60%]" />
        <div className="mt-[0.35rem] flex flex-col gap-[0.4rem]">
          <Skeleton className="skel-line w-[70%]" />
          <Skeleton className="skel-line w-[55%]" />
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-[0.6rem] px-4 pb-4 pt-[0.85rem]">
        <Skeleton className="h-[1.6rem] w-20" />
        <Skeleton className="h-8 w-10 rounded-ui" />
      </div>
    </div>
  )
}

/** A grid of card placeholders, matching the real `.grid-cards` layout. */
export function EventGridSkeleton({ count = 4, className = '', style }) {
  return (
    <SkeletonRegion className={`grid grid-cards ${className}`} style={style}>
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </SkeletonRegion>
  )
}

/** The hero's "Next up" card, on navy — hence the dark variant. */
export function SpotlightSkeleton() {
  return (
    <SkeletonRegion className="spotlight">
      <div className="spot-head">
        <Skeleton className="h-[0.8rem] w-16" dark />
        <Skeleton className="h-[1.1rem] w-20 rounded-full" dark />
      </div>
      <Skeleton className="mx-[0.9rem] h-[104px] rounded-ui" dark />
      <div className="flex flex-col gap-[0.5rem] px-[0.9rem] pb-[0.9rem] pt-[0.8rem]">
        <Skeleton className="skel-line lg w-[80%]" dark />
        <Skeleton className="skel-line w-[55%]" dark />
        <Skeleton className="skel-line w-[65%]" dark />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/15 px-[0.9rem] py-[0.75rem]">
        <Skeleton className="h-[1.6rem] w-20" dark />
        <Skeleton className="h-8 w-28 rounded-ui" dark />
      </div>
    </SkeletonRegion>
  )
}

/** Event detail: breadcrumb, cover hero, seat map beside the ticket sidebar. */
export function EventDetailSkeleton() {
  return (
    <SkeletonRegion className="container container-wide">
      <Skeleton className="skel-line mb-4 w-48" />
      <Skeleton className="h-[210px] w-full rounded-hero" />
      <div className="split" style={{ marginTop: '1.4rem' }}>
        <div className="panel">
          <div className="panel-head">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="panel-body">
            <Skeleton className="h-[320px] w-full rounded-card" />
          </div>
        </div>
        <div className="stack">
          <SkeletonPanel lines={4} />
          <SkeletonPanel lines={3} />
        </div>
      </div>
    </SkeletonRegion>
  )
}

/** Checkout and payment share a form-beside-summary layout. */
export function CheckoutSkeleton() {
  return (
    <SkeletonRegion className="container">
      <Skeleton className="h-[2.1rem] w-[19rem] rounded-full" />
      <div className="split" style={{ marginTop: '1.3rem' }}>
        <div className="stack">
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={3} />
        </div>
        <SkeletonPanel lines={4} />
      </div>
    </SkeletonRegion>
  )
}

/** The booking rows on "My bookings": status chips, title, meta, amount. */
export function BookingListSkeleton({ count = 3 }) {
  return (
    <SkeletonRegion className="stack-sm">
      {Array.from({ length: count }, (_, i) => (
        <div className="card" key={i} aria-hidden="true">
          <div className="card-body">
            <div className="spread">
              <div className="flex-auto min-w-0 stack-sm">
                <div className="row row-tight">
                  <Skeleton className="h-[1.4rem] w-24 rounded-full" />
                  <Skeleton className="skel-line w-20" />
                </div>
                <Skeleton className="skel-line lg w-[45%]" />
                <Skeleton className="skel-line w-[60%]" />
              </div>
              <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                <Skeleton className="h-[1.3rem] w-16" />
                <Skeleton className="skel-line w-24" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/**
 * A table's worth of placeholder rows, inside the real `<table>` shell.
 *
 * Rendered as actual rows rather than a stack of blocks so the column widths
 * are the ones the loaded table will use — a centred "Loading…" lets every
 * column resize the moment data arrives, which is the jump these exist to
 * prevent. Widths vary per column so the block does not read as a grid.
 */
export function TableRowsSkeleton({ rows = 6, cols = 5, widths, cellClassName = '', rowClassName = '' }) {
  // A repeating, uneven pattern beats random: it stays stable across re-renders
  // and still reads as text of differing lengths.
  const pattern = widths || ['70%', '45%', '60%', '40%', '55%', '35%', '50%']
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className={rowClassName}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={cellClassName}>
              <Skeleton
                className="skel-line"
                style={{ width: pattern[(r + c) % pattern.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

/** The four MiniStat tiles on the organizer dashboard's right rail. */
function StatTilesSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col justify-between gap-5 rounded-card border border-line bg-surface p-4 shadow-card"
          aria-hidden="true"
        >
          <Skeleton className="h-6 w-20" />
          <div className="flex items-end justify-between gap-2">
            <Skeleton className="skel-line w-16" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The organizer dashboard: bar chart and events table on the left, revenue
 * breakdown and stat tiles on the right.
 *
 * The chart placeholder is twelve bars of settled, uneven heights rather than
 * one grey slab — a flat block at chart size reads as a broken image, and the
 * bars tell the reader what is about to appear there.
 */
export function OrganizerDashboardSkeleton() {
  const bars = [38, 62, 45, 80, 55, 92, 48, 70, 35, 84, 58, 66]
  return (
    <SkeletonRegion className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <section
          className="rounded-card border border-line bg-surface p-5 shadow-card"
          aria-hidden="true"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="skel-line w-32" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-[1.4rem] w-24 rounded-full" />
          </div>
          <div className="flex h-32 items-end gap-1.5">
            {bars.map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-tiny" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-3 flex justify-between gap-1.5">
            {bars.map((_, i) => (
              <Skeleton key={i} className="skel-line h-2 flex-1" />
            ))}
          </div>
        </section>

        <section
          className="rounded-card border border-line bg-surface p-5 shadow-card"
          aria-hidden="true"
        >
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="skel-line w-24" />
          </div>
          <div className="table-wrap">
            <table className="table">
              <TableRowsSkeleton rows={5} cols={6} />
            </table>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section
          className="rounded-card border border-line bg-surface p-5 shadow-card"
          aria-hidden="true"
        >
          <Skeleton className="mb-4 h-4 w-36" />
          <div className="flex flex-col gap-3.5">
            {[92, 74, 58, 40, 26].map((w, i) => (
              <div key={i}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <Skeleton className="skel-line w-[55%]" />
                  <Skeleton className="skel-line w-12" />
                </div>
                <Skeleton className="h-2 rounded-full" style={{ width: `${w}%` }} />
                <Skeleton className="skel-line mt-1 h-2 w-20" />
              </div>
            ))}
          </div>
        </section>
        <StatTilesSkeleton />
      </div>
    </SkeletonRegion>
  )
}

/** Event sales: stat row, the tier table, then the two side panels. */
export function EventSalesSkeleton() {
  return (
    <SkeletonRegion className="container container-wide">
      <div className="page-head">
        <div className="stack-sm">
          <Skeleton className="skel-line w-28" />
          <Skeleton className="h-[1.7rem] w-64" />
          <Skeleton className="skel-line w-48" />
        </div>
        <Skeleton className="h-[1.6rem] w-24 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col justify-between gap-5 rounded-card border border-line bg-surface p-4 shadow-card"
            aria-hidden="true"
          >
            <Skeleton className="skel-line w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: '1.3rem' }} aria-hidden="true">
        <div className="panel-head">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="table-wrap">
          <table className="table">
            <TableRowsSkeleton rows={4} cols={6} />
          </table>
        </div>
      </div>

      <div className="split" style={{ marginTop: '1.3rem' }}>
        <SkeletonPanel lines={4} />
        <SkeletonPanel lines={3} />
      </div>
    </SkeletonRegion>
  )
}

/** Booking detail: reference heading, status banner, then the detail panels. */
export function BookingDetailSkeleton() {
  return (
    <SkeletonRegion className="container">
      <div className="page-head" style={{ marginTop: '1rem' }}>
        <div className="stack-sm">
          <Skeleton className="skel-line w-24" />
          <Skeleton className="h-[1.7rem] w-56" />
          <Skeleton className="skel-line w-72" />
        </div>
        <Skeleton className="h-[1.6rem] w-28 rounded-full" />
      </div>
      <Skeleton className="h-[3.4rem] w-full rounded-card" />
      <div className="split" style={{ marginTop: '1.3rem' }}>
        <div className="stack">
          <SkeletonPanel lines={4} />
          <SkeletonPanel lines={3} />
        </div>
        <SkeletonPanel lines={4} />
      </div>
    </SkeletonRegion>
  )
}
