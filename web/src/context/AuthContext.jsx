import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authenticate, getOrganizerProfileForUser, getUserById, registerUser } from '../mock/store.js'

const AuthContext = createContext(null)

// Roles as they exist in the backend enum (Role.java / app_user.role).
export const ROLES = ['CUSTOMER', 'ORGANIZER', 'PLATFORM_ADMIN']

const SESSION_KEY = 'mockUserId'

export function AuthProvider({ children }) {
  const [userId, setUserId] = useState(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? Number(raw) : null
  })

  useEffect(() => {
    if (userId) localStorage.setItem(SESSION_KEY, String(userId))
    else localStorage.removeItem(SESSION_KEY)
  }, [userId])

  const user = userId ? getUserById(userId) : null

  const login = useCallback(({ identifier, password }) => {
    const result = authenticate(identifier, password)
    if (result.user) setUserId(result.user.id)
    return result
  }, [])

  const register = useCallback((payload) => {
    const result = registerUser(payload)
    if (result.user) setUserId(result.user.id)
    return result
  }, [])

  const logout = useCallback(() => setUserId(null), [])

  const value = useMemo(() => {
    const role = user?.role || null
    return {
      user,
      role,
      isAuthenticated: !!user,
      isOrganizer: role === 'ORGANIZER' || role === 'PLATFORM_ADMIN',
      isAdmin: role === 'PLATFORM_ADMIN',
      organizerProfile: user ? getOrganizerProfileForUser(user.id) : null,
      login,
      register,
      logout,
    }
  }, [user, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
