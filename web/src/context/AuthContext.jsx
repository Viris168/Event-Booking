import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { refreshTokens } from '../api/client.js'
import {
  clearTokens,
  hadSession,
  login as apiLogin,
  logout as apiLogout,
  googleLogin as apiGoogleLogin,
  me as apiMe,
  register as apiRegister,
  storeTokens,
} from '../api/auth.js'

const AuthContext = createContext(null)

// Roles as they exist in the backend enum (Role.java / app_user.role).
export const ROLES = ['CUSTOMER', 'ORGANIZER', 'PLATFORM_ADMIN']

/**
 * Maps an API failure onto the codes the auth screens already render.
 *
 * <p>The server deliberately answers the same INVALID_CREDENTIALS for an
 * unknown phone and a wrong password, so that a stranger cannot use the login
 * form to discover which numbers hold accounts. The UI used to distinguish the
 * two - it was reading a local array and could see everything - and keeping
 * that distinction now would mean inventing information the server refused to
 * give.
 */
function toErrorCode(error) {
  const code = error?.response?.data?.errorCode
  if (code === 'INVALID_CREDENTIALS') return 'BAD_CREDENTIALS'
  if (code === 'ACCOUNT_DISABLED') return 'ACCOUNT_DISABLED'
  if (code === 'PHONE_ALREADY_REGISTERED') return 'PHONE_TAKEN'
  if (code === 'EMAIL_ALREADY_REGISTERED') return 'EMAIL_TAKEN'
  if (code === 'INVALID_GOOGLE_TOKEN') return 'GOOGLE_FAILED'
  if (!error?.response) return 'NETWORK'
  return code || 'UNKNOWN'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Distinct from `!user`: on a reload we may still have a session but not yet
  // know who it belongs to, and a router that reads !user during that window
  // bounces a signed-in person to the login screen.
  const [loading, setLoading] = useState(() => hadSession())

  const loadMe = useCallback(async () => {
    const profile = await apiMe()
    setUser(profile)
    return profile
  }, [])

  // Resume a session across a page load.
  //
  // Nothing survives the reload on this side any more - the access token is a
  // module variable that died with the old page - so the session is rebuilt
  // from the httpOnly cookie: refresh first for a new access token, then ask
  // who it belongs to. The user record is deliberately not cached either; it
  // would go stale the moment an admin changed a role.
  //
  // Guarded by the session hint so the common case, a visitor who has never
  // signed in, does not pay for a refresh that can only 401.
  useEffect(() => {
    if (!hadSession()) return
    let cancelled = false
    refreshTokens()
      .then(() => loadMe())
      .catch(() => {
        // Expired past refreshing, revoked, or the account is gone. There is
        // nothing to recover.
        clearTokens()
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadMe])

  // The axios interceptor fires this when a refresh fails mid-session. Without
  // it the UI would keep rendering a signed-in shell around requests that are
  // all 401ing.
  useEffect(() => {
    const onSignedOut = () => setUser(null)
    window.addEventListener('auth:signed-out', onSignedOut)
    return () => window.removeEventListener('auth:signed-out', onSignedOut)
  }, [])

  /**
   * Two round trips on purpose: `/auth/login` returns credentials, `/auth/me`
   * returns identity. Folding the user into the token response would tempt a
   * client to trust the JWT's own claims, which it cannot verify.
   */
  const login = useCallback(
    async ({ identifier, password }) => {
      try {
        storeTokens(await apiLogin({ phone_e164: identifier.trim(), password }))
        return { user: await loadMe() }
      } catch (error) {
        clearTokens()
        return { error: toErrorCode(error) }
      }
    },
    [loadMe],
  )

  /**
   * Google's ID token in, our own session out.
   *
   * Shaped exactly like `login` on purpose - the caller gets {user} or {error}
   * either way, so a screen does not need to know which button was pressed.
   *
   * EMAIL_TAKEN here means a password account already holds that address.
   * Adopting it would let anyone holding a Google token for the address take
   * over the password account, so the server refuses and the copy has to send
   * the user to the ordinary sign-in form instead.
   */
  const loginWithGoogle = useCallback(
    async (idToken) => {
      try {
        await apiGoogleLogin(idToken)
        return { user: await loadMe() }
      } catch (error) {
        clearTokens()
        return { error: toErrorCode(error) }
      }
    },
    [loadMe],
  )

  const register = useCallback(
    async (payload) => {
      try {
        storeTokens(await apiRegister(payload))
        return { user: await loadMe() }
      } catch (error) {
        clearTokens()
        return { error: toErrorCode(error) }
      }
    },
    [loadMe],
  )

  const logout = useCallback(async () => {
    // Clear locally first. If the network call hangs, the user is still signed
    // out here - which is what they asked for - and the server-side revoke is
    // best-effort.
    setUser(null)
    const done = apiLogout()
    clearTokens()
    await done
  }, [])

  const value = useMemo(() => {
    const role = user?.role || null
    return {
      user,
      loading,
      role,
      isAuthenticated: !!user,
      isOrganizer: role === 'ORGANIZER' || role === 'PLATFORM_ADMIN',
      isAdmin: role === 'PLATFORM_ADMIN',
      // Shaped like the mock store's organizer_profile row so the organiser
      // pages that read `.id` keep working unchanged.
      organizerProfile: user?.organizer_profile_id
        ? {
            id: user.organizer_profile_id,
            user_id: user.id,
            org_name_en: user.org_name_en,
            org_name_km: user.org_name_km,
          }
        : null,
      login,
      loginWithGoogle,
      register,
      logout,
      refreshUser: loadMe,
    }
  }, [user, loading, login, loginWithGoogle, register, logout, loadMe])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
