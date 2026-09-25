import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { withViewTransition } from '../lib/viewTransition.js'

const ThemeContext = createContext(null)
const KEY = 'theme'

function initialTheme() {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  // No explicit choice yet: follow the OS.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(initialTheme)

  useEffect(() => {
    localStorage.setItem(KEY, theme)
    // `data-theme` drives the token overrides and the `dark:` variant in the
    // stylesheet; `color-scheme` fixes native controls, scrollbars and the
    // browser's own form widgets.
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  // Keep following the OS until the user picks a side themselves.
  useEffect(() => {
    if (localStorage.getItem(KEY)) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setThemeState(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Every user-driven switch (navbar toggle, Account panel) goes through here
  // so it crossfades. The attribute is written directly so it is in place
  // before the browser captures the "after" snapshot, rather than waiting on
  // the effect.
  const setTheme = useCallback((next) => {
    const root = document.documentElement
    if (next === root.dataset.theme) return
    withViewTransition(() => {
      root.dataset.theme = next
      root.style.colorScheme = next
      setThemeState(next)
    })
  }, [])

  const toggle = useCallback(
    () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
    [setTheme],
  )

  const value = useMemo(() => ({ theme, isDark: theme === 'dark', toggle, setTheme }), [theme, toggle, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
