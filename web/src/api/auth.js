import client from './client.js'

/**
 * The auth lane. Everything here is a thin wrapper except the token plumbing,
 * which lives partly in client.js because the request interceptor needs it too.
 */

/**
 * The access token lives in a module variable, not in storage.
 *
 * <p>It used to sit in localStorage next to the refresh token, where any script
 * on the page could read both. A module variable is not a security boundary -
 * injected script shares this heap - but it dies with the tab, so what an XSS
 * steals expires in fifteen minutes instead of fourteen days. The refresh token
 * it cannot touch at all: that one is an httpOnly cookie now, set by
 * /auth/login and sent back only to /api/v1/auth.
 *
 * <p>Nothing exports a setter for the refresh token because nothing in this
 * codebase can see it any more. That is the point.
 */
let accessToken = null

export const getAccessToken = () => accessToken

/**
 * Remembers that a session probably exists, so a first page load knows whether
 * to attempt a refresh.
 *
 * <p>Not a credential - it is the string "1", and forging it buys nothing but a
 * 401 from the refresh endpoint. It exists so that anonymous visitors, who are
 * most visitors, do not pay for a doomed /auth/refresh on every page load.
 */
const SESSION_HINT = 'has_session'
export const hadSession = () => localStorage.getItem(SESSION_HINT) === '1'

/**
 * Keys written by the versions that kept credentials in storage.
 *
 * <p>Purged as this module loads rather than only on sign-out, because the
 * people most exposed are the ones who never sign out: a browser that held a
 * token pair when this code shipped would otherwise keep it sitting in
 * localStorage - readable by any script - until the user happened to log out.
 * The refresh token among them is still live for up to fourteen days.
 */
const LEGACY_KEYS = ['access_token', 'refresh_token', 'mockUserId']
LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))

export function storeTokens(tokens) {
  accessToken = tokens.access_token
  localStorage.setItem(SESSION_HINT, '1')
}

export function clearTokens() {
  accessToken = null
  localStorage.removeItem(SESSION_HINT)
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))
}

export const login = (data) => client.post('/auth/login', data).then((r) => r.data)
export const register = (data) => client.post('/auth/register', data).then((r) => r.data)

/** The current user's own record: id, role, and organizer_profile_id. */
export const me = () => client.get('/auth/me').then((r) => r.data)

/**
 * Ends the session server-side. The cookie is what identifies it - the browser
 * attaches it, this code cannot read it - and the response clears it.
 *
 * <p>Never rejects. A logout that fails because the session was already gone
 * has achieved what the caller wanted, and a user who clicks "sign out" must
 * end up signed out whatever the network says.
 */
export function logout() {
  return client.post('/auth/logout').catch(() => {})
}
