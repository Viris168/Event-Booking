import axios from 'axios'
import { clearTokens, getAccessToken, storeTokens } from './auth.js'

// Central axios instance. Reads the API base URL from .env (VITE_API_BASE_URL).
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  // The refresh token is an httpOnly cookie, so /auth/refresh and /auth/logout
  // only work if the browser attaches it. Same-origin requests would do that
  // anyway - Vite proxies /api in development, Caddy routes it in production -
  // but this keeps working if VITE_API_BASE_URL is ever pointed straight at the
  // API's own origin, which would then also need allowCredentials in CORS.
  withCredentials: true,
})

// Attach the access token to every request. The X-User-Id header this used to
// send is gone: the API no longer lets a caller state who they are, because a
// header anyone can type is not an identity - it is a suggestion.
client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * One refresh at a time.
 *
 * <p>A page that fires six requests on mount gets six 401s at once when the
 * access token expires. Without this, all six would call /auth/refresh - and
 * since each refresh REVOKES the token it was given, the first would succeed
 * and the other five would present an already-burned token, which the API
 * correctly treats as a replayed credential. The user would be signed out by
 * the act of loading a page.
 *
 * <p>So the first 401 starts the refresh and the rest await the same promise.
 */
let refreshing = null

export function refreshTokens() {
  if (!refreshing) {
    // No body: the refresh token is a cookie this code cannot read, and the
    // browser attaches it on its own. `withCredentials` is set here too because
    // this is a bare axios call, not `client` - going through the instance
    // would put the request back through the interceptor below and, on a
    // failure, start refreshing the refresh.
    refreshing = axios
      .post(`${client.defaults.baseURL}/auth/refresh`, null, { withCredentials: true })
      .then((r) => {
        storeTokens(r.data)
        return r.data.access_token
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

const CREDENTIAL_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/change-password',
]

// On 401, refresh once and replay the request. Only once: `_retried` is what
// stops a genuinely unauthorized call from looping forever.
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    const isRefreshable =
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      // A 401 from these means the credentials just supplied were rejected.
      // Refreshing in response to "wrong password" would replace a clear error
      // with a confusing one.
      //
      // Named individually rather than matching '/auth/' as a prefix: /auth/me
      // is an ordinary authenticated endpoint that happens to live there, and
      // read or written it deserves the same retry as anything else. Excluding
      // it meant an access token expiring while someone filled in the profile
      // form threw their edits away instead of refreshing underneath them.
      !CREDENTIAL_ENDPOINTS.some((path) => original.url?.includes(path))

    if (!isRefreshable) {
      return Promise.reject(error)
    }

    original._retried = true
    try {
      const token = await refreshTokens()
      original.headers.Authorization = `Bearer ${token}`
      return client(original)
    } catch {
      // The refresh token is gone, expired or already spent. This is a real
      // sign-out; AuthContext is listening for it.
      clearTokens()
      window.dispatchEvent(new Event('auth:signed-out'))
      return Promise.reject(error)
    }
  },
)

export default client
