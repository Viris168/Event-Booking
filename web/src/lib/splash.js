/**
 * Dismisses the boot splash that index.html paints before the bundle loads.
 *
 * Held for a minimum time measured from navigation start, not from this call:
 * on a warm cache the app is ready in a few frames, and a logo that flashes
 * for 50ms reads as a glitch rather than a loading screen.
 */
const MIN_VISIBLE_MS = 600

let hidden = false

export function hideSplash() {
  if (hidden) return
  hidden = true
  const el = document.getElementById('splash')
  if (!el) return
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now())
  setTimeout(() => {
    el.classList.add('is-done')
    // Removed after the fade so it stops sitting on top of the page's focus
    // order and hit-testing.
    el.addEventListener('transitionend', () => el.remove(), { once: true })
    setTimeout(() => el.remove(), 500)
  }, wait)
}
