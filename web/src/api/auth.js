import client from './client.js'

/**
 * The auth lane. Everything here is a thin wrapper except the token plumbing,
 * which lives in client.js because the request interceptor needs it too.
 */

const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY)
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY)

/**
 * Both tokens, or neither.
 *
 * <p>Storing them separately invites the half-state where an expired access
 * token sits next to a missing refresh token, which presents as "randomly
 * logged out" rather than as an error anyone can act on.
 */
export function storeTokens(tokens) {
  localStorage.setItem(ACCESS_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  // The prototype's session key. Removed on every sign-out so a browser that
  // used the old mock auth does not keep sending a stale X-User-Id forever.
  localStorage.removeItem('mockUserId')
}

export const login = (data) => client.post('/auth/login', data).then((r) => r.data)
export const register = (data) => client.post('/auth/register', data).then((r) => r.data)

/** The current user's own record: id, role, and organizer_profile_id. */
export const me = () => client.get('/auth/me').then((r) => r.data)

/**
 * Ends the session server-side. The refresh token is the thing being revoked -
 * the access token cannot be, which is exactly why it only lasts 15 minutes.
 *
 * <p>Never rejects. A logout that fails because the token was already gone has
 * achieved what the caller wanted, and a user who clicks "sign out" must end up
 * signed out whatever the network says.
 */
export function logout() {
  const refresh_token = getRefreshToken()
  if (!refresh_token) return Promise.resolve()
  return client.post('/auth/logout', { refresh_token }).catch(() => {})
}
