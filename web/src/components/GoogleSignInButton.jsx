import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/*
 * Google's own button, rendered by Google's own script.
 *
 * Not a button of ours that calls an SDK. Google Identity Services renders the
 * control inside a cross-origin iframe and hands back an ID token through the
 * callback - a look-alike we styled ourselves could not obtain one, and the
 * branding rules do not allow it anyway.
 *
 * The script is loaded here rather than in index.html so a deployment with no
 * client id never contacts Google at all: nothing renders, nothing is fetched,
 * and the sign-in screens simply have one fewer option.
 */

const SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

/*
 * renderButton takes a pixel width and nothing else - no percentage, no "fill".
 * 400 is Google's documented ceiling and it silently clamps past it; 200 is the
 * point below which the label starts truncating. So the button is measured
 * against whatever card it lands in and asked for that, bounded by these.
 */
const MIN_W = 200
const MAX_W = 400

/*
 * The personalised "Continue as <name>" iframe has a fixed ~40px height that no
 * option or stylesheet reaches, so it is scaled up as a whole in CSS
 * (.gsi-host.is-framed) - keep the two in step. Scaling widens it too, so it is
 * asked for a width this much narrower to land on the same footprint.
 */
const FRAME_SCALE = 1.1

/**
 * One shared load. Two screens mounting at once must not inject two scripts.
 *
 * <p>Keyed by language, because GIS reads the button's language from `hl` on
 * the script URL at load time and there is no way to change it afterwards. The
 * `locale` field passed to renderButton is documented but does not override it
 * — with no `hl`, Google picks the language itself (by IP, among other things),
 * which is why an English page here was rendering a Khmer button. A language
 * switch therefore has to drop the script and its global and fetch again.
 */
let loader = null
let loadedHl = null
function loadGis(hl) {
  if (loader && loadedHl === hl) return loader
  if (loader) {
    document.querySelectorAll(`script[src^="${SRC}"]`).forEach((n) => n.remove())
    delete window.google
    loader = null
  }
  loadedHl = hl
  loader = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const el = document.createElement('script')
    el.src = `${SRC}?hl=${encodeURIComponent(hl)}`
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => {
      // Let a later mount try again - this is usually a blocked network rather
      // than a permanent condition.
      loader = null
      loadedHl = null
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.appendChild(el)
  })
  return loader
}

/**
 * @param {(idToken: string) => void} onToken receives the credential to POST to
 *        /auth/google. This component never talks to our API itself.
 */
export default function GoogleSignInButton({ onToken, disabled = false }) {
  const { locale } = useLocale()
  const { isDark } = useTheme()
  const km = locale === 'km'
  const hostRef = useRef(null)
  const wrapRef = useRef(null)
  const [failed, setFailed] = useState(false)
  // 0 until measured. The render effect waits for it rather than guessing, so
  // the button is only ever drawn at the width it should already be.
  const [width, setWidth] = useState(0)
  // Whether Google drew the personalised iframe rather than the plain button.
  // Only known after the first render, and sticky: once signed in to Google,
  // every re-render on this page takes the same path.
  const [framed, setFramed] = useState(false)

  /*
   * The old fixed 320px was narrower than the submit button above it on every
   * screen that uses this, which read as a second-class option rather than a
   * deliberate one. Measuring instead means it lines up with whatever it sits
   * under, and keeps doing so when the card reflows.
   */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      // Whole pixels only: a sub-pixel reflow must not re-initialise the widget.
      setWidth((prev) => (prev === next ? prev : next))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /*
   * The callback has to survive re-renders without re-initialising Google's
   * widget, so it lives in a ref that the (stable) callback below reads.
   * Passing onToken straight to initialize would re-run this effect on every
   * parent render and flicker the button.
   */
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!CLIENT_ID || !hostRef.current || !width) return undefined
    let cancelled = false
    let mo = null

    loadGis(km ? 'km' : 'en')
      .then(() => {
        if (cancelled || !hostRef.current) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onTokenRef.current?.(response.credential),
        })
        // renderButton appends rather than replaces, so a re-render on a theme
        // or width change would stack a second button under the first.
        hostRef.current.replaceChildren()
        window.google.accounts.id.renderButton(hostRef.current, {
          // Google offers no token-driven theme, so the app's dark mode is
          // mirrored by hand. In the personalised iframe the dark theme puts the
          // G on a white disc; that is Google's artwork and out of our reach.
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          // Only the personalised "Continue as <name>" iframe honours this; the
          // signed-out button's corners are set in CSS to match .btn-lg.
          shape: 'pill',
          width: Math.round(
            Math.max(MIN_W, Math.min(MAX_W, width)) / (framed ? FRAME_SCALE : 1),
          ),
          // Default is 'left', which strands the mark against the far edge with
          // the label centred in what is left - the wider the button, the bigger
          // the gap. Centring sets the two as one unit, like every other button
          // on these screens.
          logo_alignment: 'center',
          text: 'continue_with',
          locale: km ? 'km' : 'en',
        })
        // The personalised path shows itself by giving Google's iframe a real
        // height; the plain one keeps it at 0.
        if (!framed) {
          const check = () => {
            const frame = hostRef.current?.querySelector('iframe')
            if (frame && frame.offsetHeight > 0) {
              mo?.disconnect()
              setFramed(true)
            }
          }
          mo = new MutationObserver(check)
          mo.observe(hostRef.current, { subtree: true, childList: true, attributes: true })
          check()
        }
      })
      .catch(() => !cancelled && setFailed(true))

    return () => {
      cancelled = true
      mo?.disconnect()
    }
  }, [km, isDark, width, framed])

  // Nothing at all when the deployment has no client id. An "unavailable"
  // message would be telling users about a feature that does not exist here.
  if (!CLIENT_ID) return null

  if (failed) {
    return (
      <p className="small muted">
        {km ? 'មិនអាចផ្ទុកការចូលដោយ Google បានទេ។' : 'Google sign-in could not load.'}
      </p>
    )
  }

  return (
    <div className="gsi-wrap" ref={wrapRef} aria-busy={disabled}>
      <div className="gsi-sep">
        <span>{km ? 'ឬ' : 'or'}</span>
      </div>
      {/* Google draws into this node. Height is reserved so the form does not
          jump when the widget arrives a moment after the page. */}
      <div ref={hostRef} className={framed ? 'gsi-host is-framed' : 'gsi-host'} />
    </div>
  )
}
