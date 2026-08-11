import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth()

  return (
    <nav className="navbar">
      <Link to="/" className="brand">🎫 Event Booking</Link>
      <div className="nav-links">
        <Link to="/events">Events</Link>
        {isAuthenticated && <Link to="/my-bookings">My Bookings</Link>}
        {isAuthenticated && user?.role === 'ADMIN' && <Link to="/admin">Admin</Link>}
        {isAuthenticated ? (
          <button onClick={logout}>Logout</button>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  )
}
