import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'

/**
 * Tab strip for the denser organizer / admin tooling.
 *
 * <p>A link may carry a `count` (a queue depth) or `alert` (something is wrong
 * and the number would not change what you do about it). Both are optional and
 * the strip is otherwise the dumb component it was - it renders what it is
 * handed and never asks the server anything itself, which is what lets the
 * organiser and admin layouts share it while only one of them has counts.
 */
export default function RoleSubnav({ links }) {
  const ref = useRef(null)

  /*
   * Bring the current tab into view.
   *
   * The strip scrolls sideways on a phone, and the tab you are actually on is
   * often the one past the fold - an organiser opening Payouts landed on a
   * strip showing "My events, Venues, Transactions" with no sign that the page
   * they were reading had a tab at all. Scrolling to it also doubles as the
   * hint that the strip moves: it starts part-scrolled, so the edge shadow is
   * there to be seen.
   *
   * `block: 'nearest'` so the page itself never scrolls - only the strip.
   */
  useEffect(() => {
    const active = ref.current?.querySelector('a.active')
    active?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [links])

  return (
    <div className="subnav">
      <div className="subnav-inner scroll-hint-x" ref={ref}>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}

            {/*
             * Capped, because the tab is in a strip that already scrolls and a
             * four-figure count would widen it every time the queue grew.
             * Anything past 99 means the same thing anyway: more than a sitting.
             */}
            {l.count > 0 && (
              <span className="subnav-count" aria-hidden="true">
                {l.count > 99 ? '99+' : l.count}
              </span>
            )}

            {l.alert && <span className="subnav-dot" aria-hidden="true" />}

            {/*
             * The badge is hidden from assistive tech and said in words here
             * instead. A bare "4" appended to the link's name is read as
             * "Review queue 4", which could as easily be the fourth review
             * queue; `badgeLabel` carries the localised "4 waiting".
             */}
            {l.badgeLabel && <span className="sr-only">, {l.badgeLabel}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
