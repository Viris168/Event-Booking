import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Wraps routes that need a login, optionally restricted to specific roles.
 * Roles come from the backend enum: CUSTOMER | ORGANIZER | PLATFORM_ADMIN.
 *
 * <p>A role gate means the role itself and nothing else. PLATFORM_ADMIN used to
 * be waved through anything marked ORGANIZER on the grounds that it outranks it,
 * but rank is not the same as purpose: /organizer is one organiser's own venues,
 * events and door scanner, and an admin has no such things. The admin equivalent
 * of every one of those screens already exists under /admin, reading every
 * organiser at once rather than pretending to be one.
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, loading, role } = useAuth()
  const location = useLocation()

  // On a hard reload the token is in storage but /auth/me has not answered yet,
  // so `isAuthenticated` is briefly false for a user who is perfectly signed in.
  // Redirecting during that window sends people to the login screen every time
  // they refresh a page - and, worse, loses where they were going.
  if (loading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }

  if (roles && roles.length) {
    if (!roles.includes(role)) return <Navigate to="/" replace />
  }

  return <Outlet />
}
