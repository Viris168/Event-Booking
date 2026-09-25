import { flushSync } from 'react-dom'

/**
 * Runs a page-wide change (the light/dark or language switch) as a transition
 * between a snapshot of the old page and the new one. The update has to land
 * inside the callback so the browser can capture the "after" state, hence the
 * synchronous flush. Falls back to a plain update where the API is missing
 * or the reader asked for reduced motion.
 *
 * `kind` is written to <html data-transition> for the transition's lifetime
 * so the stylesheet can pace each kind differently - see the view-transition
 * rules in index.css.
 */
export function withViewTransition(update, kind) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduce) {
    update()
    return
  }
  const root = document.documentElement
  if (kind) root.dataset.transition = kind
  const transition = document.startViewTransition(() => flushSync(update))
  if (kind) {
    transition.finished.finally(() => {
      if (root.dataset.transition === kind) delete root.dataset.transition
    })
  }
}
