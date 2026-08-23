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

/** One grey block. Size it with utilities: `<Skeleton className="h-4 w-1/2" />`. */
export function Skeleton({ className = '', dark = false }) {
  return <span className={`skel ${dark ? 'skel-dark' : ''} ${className}`} aria-hidden="true" />
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
            <Skeleton className="h-[1rem] w-40" />
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
