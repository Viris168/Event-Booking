import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * A single-page app keeps the scroll position across navigations, so clicking
 * an event near the bottom of the list lands you halfway down its detail page.
 * Reset on pathname change only — changing search params (filtering, paging)
 * should leave the reader where they are.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }, [pathname])
  return null
}
