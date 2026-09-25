import { flushSync } from 'react-dom'

/**
 * Runs a page-wide change (the light/dark switch) as a crossfade between a
 * snapshot of the old page and the new one. The update has to land inside
 * the callback so the browser can capture the "after" state, hence the
 * synchronous flush. Falls back to a plain update where the API is missing
 * or the reader asked for reduced motion.
 */
export function withViewTransition(update) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}
