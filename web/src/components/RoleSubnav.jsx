import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'

/** Tab strip for the denser organizer / admin tooling. */
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
      <div className="subnav-inner" ref={ref}>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
