import { createContext, useContext, useState, useCallback } from 'react'
import * as authApi from '../api/auth.js'

const AuthContext = createContext(null)

function decodeUser(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { email: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem('token')
    return t ? decodeUser(t) : null
  })

  const login = useCallback(async (credentials) => {
    const data = await authApi.login(credentials)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(decodeUser(data.token))
    return data
  }, [])

  const register = useCallback(async (payload) => {
    return authApi.register(payload)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }, [])

  const value = { token, user, isAuthenticated: !!token, login, register, logout }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
