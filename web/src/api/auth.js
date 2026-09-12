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

/**
 * Edits your own record: display name, email, language.
 *
 * No id parameter. The server edits the row the token names, so "update someone
 * else's profile" is unrepresentable rather than merely refused - the same rule
 * the organiser-application and catalogue write endpoints follow.
 *
 * Resolves with the updated record, in the same shape `me()` returns, so the
 * caller can hand it straight back to the auth context.
 *
 * Rejects 409 EMAIL_ALREADY_REGISTERED if the address belongs to another
 * account. Submitting the form without touching the email is not a conflict.
 */
export const updateProfile = (data) =>
  client
    .patch('/auth/me', {
      display_name: data.display_name,
      email: data.email || null,
      locale: data.locale,
    })
    .then((r) => r.data)

/**
 * Replaces the password and returns a FRESH TOKEN PAIR.
 *
 * The pair matters. The server revokes every outstanding refresh token,
 * including the one this browser is holding, so the old credentials are dead by
 * the time this resolves. Storing the response is what keeps the current
 * session alive - skip it and the user is signed out at the next refresh,
 * having done nothing wrong.
 *
 * Rejects 401 INVALID_CREDENTIALS when the current password is wrong, which is
 * the expected failure and not a session problem: the axios interceptor must
 * not treat it as one.
 */
export function changePassword({ current_password, new_password }) {
  return client
    .post('/auth/change-password', { current_password, new_password })
    .then((r) => {
      storeTokens(r.data)
      return r.data
    })
}
