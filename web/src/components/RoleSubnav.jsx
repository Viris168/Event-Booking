import { NavLink } from 'react-router-dom'

/** Tab strip for the denser organizer / admin tooling. */
export default function RoleSubnav({ links }) {
  return (
    <div className="subnav">
      <div className="subnav-inner">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
