import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * Wraps routes that need a login, optionally restricted to specific roles.
 * Roles come from the backend enum: CUSTOMER | ORGANIZER | PLATFORM_ADMIN.
 * PLATFORM_ADMIN inherits organizer access, as in the role table.
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, role } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }

  if (roles && roles.length) {
    const allowed = roles.includes(role) || (role === 'PLATFORM_ADMIN' && roles.includes('ORGANIZER'))
    if (!allowed) return <Navigate to="/" replace />
  }

  return <Outlet />
}
