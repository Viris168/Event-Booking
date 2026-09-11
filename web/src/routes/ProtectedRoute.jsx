import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Wraps routes that need a login, optionally restricted to specific roles.
 * Roles come from the backend enum: CUSTOMER | ORGANIZER | PLATFORM_ADMIN.
 * PLATFORM_ADMIN inherits organizer access, as in the role table.
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
    const allowed = roles.includes(role) || (role === 'PLATFORM_ADMIN' && roles.includes('ORGANIZER'))
    if (!allowed) return <Navigate to="/" replace />
  }

  return <Outlet />
}
