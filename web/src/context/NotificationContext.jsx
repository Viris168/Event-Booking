import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notifications.js'
import { useAuth } from './AuthContext.jsx'

const NotificationContext = createContext(null)

/**
 * How often the badge re-checks itself.
 *
 * Slower than the hold countdown in the navbar (10s) on purpose: a hold is
 * expiring under the user and a stale number there costs them their seats,
 * while a notification arriving up to a minute late costs nothing. Every open
 * tab pays this, so it is the interval most worth being conservative about.
 *
 * The focus listener below is what actually makes it feel immediate - somebody
 * returning to the tab is the moment they are about to look at the bell.
 */
const POLL_MS = 60_000

export function NotificationProvider({ children }) {
  const { isAuthenticated, user } = useAuth()

  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  /*
   * Guards a slow inbox response from overwriting a newer one. Switching the
   * All/Unread filter twice quickly fires two requests, and without this the
   * first to be sent can be the last to arrive - leaving the list showing the
   * filter that is no longer selected.
   */
  const requestSeq = useRef(0)

  const refreshCount = useCallback(() => {
    if (!isAuthenticated) return Promise.resolve()
    return getUnreadCount()
      .then(setUnread)
      // A failed poll is not worth a toast. The next tick tries again, and the
      // badge keeps showing the last number it was sure of.
      .catch(() => {})
  }, [isAuthenticated])

  /** Load the list itself. Only called when something is actually showing it. */
  const loadInbox = useCallback(
    (unreadOnly = false, size = 15) => {
      if (!isAuthenticated) return Promise.resolve()

      const seq = ++requestSeq.current
      setLoading(true)

      return getNotifications({ unreadOnly, size })
        .then((page) => {
          if (seq !== requestSeq.current) return
          setItems(page.content || [])
        })
        .catch(() => {
          if (seq !== requestSeq.current) return
          setItems([])
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false)
        })
    },
    [isAuthenticated],
  )

  const markRead = useCallback(
    (id) => {
      // Optimistic: the row dims the instant it is clicked, because the click
      // is usually also a navigation and the response would land after the
      // page had already changed.
      let wasUnread = false
      setItems((list) =>
        list.map((n) => {
          if (n.id !== id || n.read_at) return n
          wasUnread = true
          return { ...n, read_at: new Date().toISOString() }
        }),
      )
      if (wasUnread) setUnread((n) => Math.max(0, n - 1))

      return markNotificationRead(id).catch(() => {
        // Put the badge back rather than leaving it lying. The row stays dimmed
        // until the next load, which is the smaller of the two wrong states.
        if (wasUnread) setUnread((n) => n + 1)
      })
    },
    [],
  )

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    setUnread(0)
    return markAllNotificationsRead().catch(() => refreshCount())
  }, [refreshCount])

  // Poll the count, and stop entirely when signed out - an anonymous visitor
  // has no inbox, and a timer firing 401s at /notifications every minute would
  // put the token refresh into a loop it cannot win.
  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0)
      setItems([])
      return
    }

    refreshCount()
    const poll = setInterval(refreshCount, POLL_MS)

    // Coming back to the tab is the moment the number matters, and it is free
    // compared with polling faster to cover the same case.
    const onFocus = () => refreshCount()
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(poll)
      window.removeEventListener('focus', onFocus)
    }
    // user?.id so that signing in as somebody else drops the previous inbox
    // rather than showing their unread count to the new session.
  }, [isAuthenticated, user?.id, refreshCount])

  const value = useMemo(
    () => ({ unread, items, loading, loadInbox, refreshCount, markRead, markAllRead }),
    [unread, items, loading, loadInbox, refreshCount, markRead, markAllRead],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within a NotificationProvider')
  return ctx
}
