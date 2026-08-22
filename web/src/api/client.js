import axios from 'axios'

// Central axios instance. Reads the API base URL from .env (VITE_API_BASE_URL).
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token or user identity (if present) to every request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Short term user identity alignment for Spring Boot @RequestHeader("X-User-Id")
  const mockUserId = localStorage.getItem('mockUserId')
  if (mockUserId && !config.headers['X-User-Id']) {
    config.headers['X-User-Id'] = mockUserId
  }

  return config
})

// On 401, clear the stale token so the UI can redirect to login.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
    }
    return Promise.reject(error)
  },
)

export default client
